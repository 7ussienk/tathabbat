import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { LLMError, type CallAttempt, type CallMeta, type GenerateJsonRequest, type LLMProvider, type LLMResult, type LLMUsage } from "@/lib/llm/provider";

export type GeminiOptions = {
  apiKey: string;
  model: string;
  /** نموذج احتياطي تُعاد عليه الطلبات فوراً عند تعثّر الأول (لا إعادة على النموذج نفسه) */
  fallbackModel?: string;
  /** مهلة المحاولة الأولى (~8ث) */
  firstTimeoutMs: number;
  /** مهلة المحاولة الاحتياطية */
  fallbackTimeoutMs: number;
  /** ساعة قابلة للحقن للاختبار */
  now?: () => number;
};

/** قاطع الدائرة: ثلاث مهلات متتالية للأساسي ⟵ 5 دقائق على الاحتياطي، ثم probe بطلب واحد */
export const BREAKER_THRESHOLD = 3;
export const BREAKER_OPEN_MS = 5 * 60_000;
export type BreakerState = { timeouts: number; openUntil: number; probing: boolean };
const gb = globalThis as unknown as { __tathabbatBreaker?: Record<string, BreakerState> };
/** حالة القاطع للنموذج (مشتركة في العملية؛ تُصفَّر عند cold start) */
export function breakerFor(model: string): BreakerState {
  const all = (gb.__tathabbatBreaker ??= {});
  return (all[model] ??= { timeouts: 0, openUntil: 0, probing: false });
}
export function resetBreakers(): void {
  gb.__tathabbatBreaker = {};
}

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

  private now(): number {
    return (this.o.now ?? Date.now)();
  }

  protected async once<T>(req: GenerateJsonRequest<T>, model: string, timeoutMs: number): Promise<{ data: T; usage: LLMUsage }> {
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

  /**
   * قاطع الدائرة (قرار 4 أكتوبر مساءً): إن انتهت مهلة النموذج الأساسي BREAKER_THRESHOLD مرات متتالية يُحوَّل الطلب مباشرة إلى الاحتياطي
   * BREAKER_OPEN_MS (5 دقائق) فلا يضيع كل طلب ثماني ثوانٍ على نداء متعثّر ولا يُحاسَب نداء بلا فائدة؛ ثم يُجرَّب الأساسي بطلب واحد (probe):
   * نجح ⟵ يُغلق القاطع، تعثّر ⟵ يُعاد فتحه 5 دقائق أخرى. الحالة مشتركة بين نسخ المزوّد داخل العملية (المنسّق ينشئ مزوّداً لكل طلب).
   * يُسجَّل في meta.note: breaker_open | breaker_probe. لا نص رسالة.
   */
  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<LLMResult<T>> {
    const attempts: CallAttempt[] = [];
    const primary = { model: this.o.model, timeout: this.o.firstTimeoutMs };
    const fallback = this.o.fallbackModel && this.o.fallbackModel !== this.o.model ? { model: this.o.fallbackModel, timeout: this.o.fallbackTimeoutMs } : null;
    const b = breakerFor(this.o.model);
    const now = this.now();
    let note: CallMeta["note"];
    let probe = false;
    let plan = fallback ? [primary, fallback] : [primary];
    if (fallback && b.openUntil > 0) {
      if (now < b.openUntil || b.probing) {
        note = "breaker_open";
        plan = [fallback, primary]; // الأساسي ملاذ أخير فقط إن فشل الاحتياطي
      } else {
        b.probing = true;
        probe = true;
        note = "breaker_probe";
      }
    }
    const onPrimary = (outcome: CallAttempt["outcome"]) => {
      if (outcome === "ok") {
        b.timeouts = 0;
        b.openUntil = 0;
        b.probing = false;
      } else if (outcome === "timeout") {
        b.timeouts++;
        if (probe || b.timeouts >= BREAKER_THRESHOLD) b.openUntil = this.now() + BREAKER_OPEN_MS;
        b.probing = false;
      } else if (probe) {
        b.openUntil = this.now() + BREAKER_OPEN_MS;
        b.probing = false;
      }
    };
    let last: unknown;
    try {
      for (const step of plan) {
        const t0 = Date.now();
        const isPrimary = step.model === this.o.model;
        // الأساسي ملاذاً أخيراً بعد فشل الاحتياطي في وضع القاطع المفتوح: لا يُحتسب إلا إن جُرِّب فعلاً
        try {
          const res = await this.once(req, step.model, step.timeout);
          attempts.push({ model: step.model, ms: Date.now() - t0, outcome: "ok" });
          if (isPrimary) onPrimary("ok");
          return { ...res, meta: { label: req.label, attempts, note } };
        } catch (e) {
          const kind = e instanceof LLMError ? e.kind : "unavailable";
          const msg = String((e as Error)?.message ?? e);
          const outcome = kind === "timeout" ? "timeout" : kind === "invalid_output" ? "invalid_output" : "error";
          // جسم الخطأ كاملاً (حتى 300 حرف) لا نص الرسالة: لتشخيص أخطاء مثل 400 العابرة
          attempts.push({ model: step.model, ms: Date.now() - t0, outcome, detail: msg.slice(0, 300) });
          if (isPrimary) onPrimary(outcome);
          last = e;
          // أخطاء الطلب الدائمة (400/401/403/404) لا تُعاد على النموذج الاحتياطي لأنها لن تنجح معه عادةً
          if (kind === "unavailable" && /\b(400|401|403)\b/.test(msg) && !/UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg) && note !== "breaker_open") break;
        }
      }
    } finally {
      if (probe) b.probing = false;
    }
    // سجل تقني بلا أي نص رسالة: وسم النداء والنماذج والأزمنة فقط (لفهم تعثّر الخدمة)
    console.warn(JSON.stringify({ event: "llm_error", label: req.label, note, attempts }));
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
