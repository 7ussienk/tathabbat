import { z } from "zod";

const num = (d: number) => z.coerce.number().default(d);

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  // نموذج احتياطي تُعاد عليه الطلبات فوراً عند تعثّر الأساسي (لا إعادة على النموذج نفسه)
  GEMINI_FALLBACK_MODEL: z.string().default("gemini-3.7-flash"),
  VERIFY_API_TOKEN: z.string().optional(),
  CONFIDENCE_THRESHOLD: num(0.75),
  // سقوف الحماية (تقريبية لكل نسخة: القرار 58)؛ القيم الافتراضية هي المعتمدة في الإنتاج (قرار 4 أكتوبر مساءً)
  RATE_LIMIT_PER_MIN: num(5),
  DAILY_CAP: num(250),
  // حد يومي لكل IP، وسقف تكلفة يومي تقديري بالدولار (يُجمع من usage.cost_usd)
  IP_DAILY_CAP: num(60),
  COST_DAILY_CAP_USD: num(1.5),
  // مفتاح إيقاف: VERIFY_DISABLED=1 ⟵ المسار العام يعيد رسالة صيانة بلا أي نداء نموذج (يحتاج Redeploy)
  VERIFY_DISABLED: z.string().optional(),
  // مهلة كلية للمعالجة قبل إعادة نتيجة جزئية (R3: 25 ثانية)
  OVERALL_TIMEOUT_MS: num(25_000),
  // مهلة المحاولة الأولى على النموذج الأساسي (~8ث) ثم المحاولة الاحتياطية؛ والسقف الإجمالي OVERALL_TIMEOUT_MS
  LLM_FIRST_TIMEOUT_MS: num(8_000),
  LLM_FALLBACK_TIMEOUT_MS: num(10_000),
  // سعر Gemini لكل مليون توكن (التمهيدي حتى 31/12/2026؛ يُغيَّر من البيئة بعده: docs/GEMINI_SPIKE.md)
  PRICE_IN_PER_M: num(0.75),
  PRICE_OUT_PER_M: num(3.75),
});

export type Config = z.infer<typeof EnvSchema>;

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}
