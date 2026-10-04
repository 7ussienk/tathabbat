import type { z } from "zod";

export type LLMPart = { type: "text"; text: string } | { type: "image" | "audio"; data: string; mime_type: string };

export type LLMUsage = { input_tokens: number; output_tokens: number; thought_tokens: number };

export type GenerateJsonRequest<T> = {
  /** وسم الاستدعاء للسجلات والاختبارات (extract | judge | transcribe) */
  label: string;
  system: string;
  input: string | LLMPart[];
  schema: z.ZodType<T>;
  thinking?: "low" | "medium" | "high";
};

/** محاولة واحدة على نموذج: لمعرفة مصدر التأخر (النموذج والخطوة). تقنية فقط بلا نص. */
export type CallAttempt = { model: string; ms: number; outcome: "ok" | "timeout" | "error" | "invalid_output"; detail?: string };

/** note: حالة قاطع الدائرة لهذا النداء (breaker_open ⟵ حُوِّل للاحتياطي مباشرة، breaker_probe ⟵ تجربة الأساسي بعد الانقطاع) */
export type CallMeta = { label: string; attempts: CallAttempt[]; note?: "breaker_open" | "breaker_probe" };

export type LLMResult<T> = { data: T; usage: LLMUsage; meta?: CallMeta };

export class LLMError extends Error {
  attempts?: CallAttempt[];
  constructor(
    message: string,
    readonly kind: "timeout" | "unavailable" | "invalid_output",
  ) {
    super(message);
  }
}

/** واجهة مزود النموذج (قابلة للاستبدال عند التعطل). المخرجات منظمة ويُتحقق منها بـ Zod. */
export interface LLMProvider {
  generateJson<T>(req: GenerateJsonRequest<T>): Promise<LLMResult<T>>;
}
