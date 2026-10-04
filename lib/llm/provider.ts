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

export class LLMError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "unavailable" | "invalid_output",
  ) {
    super(message);
  }
}

/** واجهة مزود النموذج (قابلة للاستبدال عند التعطل). المخرجات منظمة ويُتحقق منها بـ Zod. */
export interface LLMProvider {
  generateJson<T>(req: GenerateJsonRequest<T>): Promise<{ data: T; usage: LLMUsage }>;
}
