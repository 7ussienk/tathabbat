import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { LLMError, type GenerateJsonRequest, type LLMProvider, type LLMUsage } from "@/lib/llm/provider";

/**
 * Gemini عبر Interactions API (docs/GEMINI_SPIKE.md): `store:false` (القاعدة 7)، `thinking_level:"low"`،
 * مخرجات منظمة بمخطط JSON من Zod. بلا File Search ولا Search grounding ولا URL context ولا أدوات (القاعدة 22).
 */
export class GeminiProvider implements LLMProvider {
  private readonly ai: GoogleGenAI;
  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<{ data: T; usage: LLMUsage }> {
    const schema = z.toJSONSchema(req.schema) as Record<string, unknown>;
    delete schema.$schema;
    const call = () =>
      this.ai.interactions.create({
        model: this.model,
        input: req.input as never,
        system_instruction: req.system,
        store: false,
        generation_config: { thinking_level: req.thinking ?? "low", temperature: 0 },
        response_format: { type: "text", mime_type: "application/json", schema },
      }) as unknown as Promise<{ output_text?: string; usage?: Record<string, number | undefined> }>;

    let r: { output_text?: string; usage?: Record<string, number | undefined> };
    for (let attempt = 1; ; attempt++) {
      try {
        r = await withTimeout(call(), this.timeoutMs);
        break;
      } catch (e) {
        // مهلة أو خطأ عابر: محاولة ثانية واحدة (مهلة 11ث × محاولتان < المهلة الكلية 25ث)
        const isTimeout = e instanceof LLMError && e.kind === "timeout";
        const msg = String((e as Error)?.message ?? e);
        const transient = isTimeout || /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|ECONNRESET/i.test(msg);
        if (attempt >= 2 || !transient) {
          if (isTimeout) throw e;
          throw new LLMError(`فشل Gemini (${req.label}): ${msg.slice(0, 200)}`, "unavailable");
        }
        await new Promise((res) => setTimeout(res, isTimeout ? 0 : 600));
      }
    }
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
    return {
      data,
      usage: { input_tokens: u.total_input_tokens ?? 0, output_tokens: (u.total_output_tokens ?? 0) + thought, thought_tokens: thought },
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new LLMError(`انتهت مهلة Gemini (${ms}ms)`, "timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}
