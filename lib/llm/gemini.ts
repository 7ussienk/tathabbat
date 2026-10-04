import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { LLMError, type CallAttempt, type GenerateJsonRequest, type LLMProvider, type LLMResult, type LLMUsage } from "@/lib/llm/provider";

export type GeminiOptions = {
  apiKey: string;
  model: string;
  /** نموذج احتياطي تُعاد عليه الطلبات فوراً عند تعثّر الأول (لا إعادة على النموذج نفسه) */
  fallbackModel?: string;
  /** مهلة المحاولة الأولى (~8ث) */
  firstTimeoutMs: number;
  /** مهلة المحاولة الاحتياطية */
  fallbackTimeoutMs: number;
};

type Raw = { output_text?: string; usage?: Record<string, number | undefined> };

/**
 * Gemini عبر Interactions API (docs/GEMINI_SPIKE.md): `store:false` (القاعدة 7)، `thinking_level:"low"`،
 * مخرجات منظمة بمخطط JSON من Zod. بلا File Search ولا Search grounding ولا URL context ولا أدوات (القاعدة 22).
 *
 * سياسة التعثّر (قرار 4 أكتوبر): المحاولة الأولى بمهلة ~8ث على النموذج الأساسي؛ عند المهلة أو خطأ عابر أو مخرجات
 * غير مطابقة للمخطط تُعاد فوراً على GEMINI_FALLBACK_MODEL لا على النموذج نفسه. السقف الإجمالي للمعالجة 25ث في المنسّق.
 * كل محاولة تُسجَّل (النموذج والزمن والنتيجة) في `meta.attempts` ليُعرف مصدر كل تأخر.
 */
export class GeminiProvider implements LLMProvider {
  private readonly ai: GoogleGenAI;
  constructor(private readonly o: GeminiOptions) {
    this.ai = new GoogleGenAI({ apiKey: o.apiKey });
  }

  private async once<T>(req: GenerateJsonRequest<T>, model: string, timeoutMs: number): Promise<{ data: T; usage: LLMUsage }> {
    const schema = z.toJSONSchema(req.schema) as Record<string, unknown>;
    delete schema.$schema;
    const r = (await withTimeout(
      this.ai.interactions.create({
        model,
        input: req.input as never,
        system_instruction: req.system,
        store: false,
        generation_config: { thinking_level: req.thinking ?? "low", temperature: 0 },
        response_format: { type: "text", mime_type: "application/json", schema },
      }) as unknown as Promise<Raw>,
      timeoutMs,
    )) as Raw;
    const text = r.output_text;
    if (!text) throw new LLMError(`رد Gemini فارغ (${req.label})`, "invalid_output");
    let data: T;
    try {
      data = req.schema.parse(JSON.parse(text));
    } catch (e) {
      throw new LLMError(`مخرجات Gemini لا تطابق المخطط (${req.label}): ${(e as Error).message.slice(0, 160)}`, "invalid_output");
    }
    const u = r.usage ?? {};
    const thought = u.total_thought_tokens ?? 0;
    return { data, usage: { input_tokens: u.total_input_tokens ?? 0, output_tokens: (u.total_output_tokens ?? 0) + thought, thought_tokens: thought } };
  }

  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<LLMResult<T>> {
    const attempts: CallAttempt[] = [];
    const plan = [{ model: this.o.model, timeout: this.o.firstTimeoutMs }];
    if (this.o.fallbackModel && this.o.fallbackModel !== this.o.model) plan.push({ model: this.o.fallbackModel, timeout: this.o.fallbackTimeoutMs });
    let last: unknown;
    for (const step of plan) {
      const t0 = Date.now();
      try {
        const res = await this.once(req, step.model, step.timeout);
        attempts.push({ model: step.model, ms: Date.now() - t0, outcome: "ok" });
        return { ...res, meta: { label: req.label, attempts } };
      } catch (e) {
        const kind = e instanceof LLMError ? e.kind : "unavailable";
        const msg = String((e as Error)?.message ?? e);
        attempts.push({ model: step.model, ms: Date.now() - t0, outcome: kind === "timeout" ? "timeout" : kind === "invalid_output" ? "invalid_output" : "error", detail: msg.slice(0, 100) });
        last = e;
        // أخطاء الطلب الدائمة (400/401/403/404) لا تُعاد على النموذج الاحتياطي لأنها لن تنجح معه عادةً
        if (kind === "unavailable" && /\b(400|401|403)\b/.test(msg) && !/UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg)) break;
      }
    }
    // سجل تقني بلا أي نص رسالة: وسم النداء والنماذج والأزمنة فقط (لفهم تعثّر الخدمة)
    console.warn(JSON.stringify({ event: "llm_error", label: req.label, attempts }));
    const err = last instanceof LLMError ? last : new LLMError(`فشل Gemini (${req.label}): ${String((last as Error)?.message ?? last).slice(0, 200)}`, "unavailable");
    (err as LLMError & { attempts?: CallAttempt[] }).attempts = attempts;
    throw err;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new LLMError(`انتهت مهلة Gemini (${ms}ms)`, "timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}
