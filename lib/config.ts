import { z } from "zod";

const num = (d: number) => z.coerce.number().default(d);

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  VERIFY_API_TOKEN: z.string().optional(),
  CONFIDENCE_THRESHOLD: num(0.75),
  // سقف الطلبات (تقريبي لكل نسخة: القرار 58)
  RATE_LIMIT_PER_MIN: num(10),
  DAILY_CAP: num(3000),
  // مهلة كلية للمعالجة قبل إعادة نتيجة جزئية (R3: 25 ثانية)
  OVERALL_TIMEOUT_MS: num(25_000),
  // مهلة كل نداء لـGemini (يُعاد مرة واحدة عند انتهائها: 2×11ث < المهلة الكلية)
  LLM_TIMEOUT_MS: num(11_000),
  // سعر Gemini لكل مليون توكن (التمهيدي حتى 31/12/2026؛ يُغيَّر من البيئة بعده: docs/GEMINI_SPIKE.md)
  PRICE_IN_PER_M: num(0.75),
  PRICE_OUT_PER_M: num(3.75),
});

export type Config = z.infer<typeof EnvSchema>;

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}
