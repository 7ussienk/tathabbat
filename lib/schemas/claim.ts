import { z } from "zod";

export const CLAIM_TYPES = ["hadith", "quran", "athar", "scholar_quote", "dua_or_virtue", "fatwa_request", "other"] as const;
export const CONTENT_LEVELS = ["A", "B", "C", "D"] as const;

export const VERDICTS = [
  "authentic",
  "weak",
  "fabricated",
  "no_basis_per_scholar", // حكم منقول عن عالم (يلزمه source وgrading_quote)
  "not_found_in_sources", // امتناع النظام بعد الفحص؛ ليس حكماً شرعياً ولا مصدر له
  "search_unavailable", // تعذّر تحميل الفهرس/أحد كتبه؛ لا يُقال «لم نجد» (القاعدة 24)
  "scholar_text_only", // نص الإمام منقولاً حرفياً بلا تصنيف آلي
  "disputed",
  "misattributed",
  "quran_verified",
  "quran_misquoted",
  "refer_to_scholar",
  "not_a_religious_claim",
] as const;
export type Verdict = (typeof VERDICTS)[number];

/** الأحكام الإيجابية التي تُحسب في نسبة الإسناد (القاعدة 11)، و`scholar_text_only` مسندة لأن مصدرها إلزامي */
export const POSITIVE_VERDICTS: readonly Verdict[] = [
  "authentic",
  "weak",
  "fabricated",
  "no_basis_per_scholar",
  "disputed",
  "misattributed",
  "quran_verified",
  "quran_misquoted",
  "scholar_text_only",
];

export const SourceRefSchema = z.object({
  source_id: z.string(),
  title: z.string(),
  location: z.string(),
  quoted_text: z.string(), // حرفي من المصدر (يقتطعه الكود لا النموذج)
  grading_quote: z.string().optional(), // حكم الإمام بنصه
  attribution_note: z.string().optional(),
  url: z.string().optional(), // صفحة المصدر (تراث للمدخلات الحية، الشاملة للمنتقى)
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const ClaimResultSchema = z.object({
  id: z.string(),
  claim_text: z.string(),
  claim_type: z.enum(CLAIM_TYPES),
  content_level: z.enum(CONTENT_LEVELS),
  verdict: z.enum(VERDICTS),
  confidence: z.number().min(0).max(1),
  sources: z.array(SourceRefSchema),
  checked_sources: z.array(z.string()).optional(),
  failed_sources: z.array(z.string()).optional(),
  review_status: z.enum(["reviewed", "pending_review"]),
  downgrade_reason: z.string().optional(),
  authentic_alternative: z.object({ text: z.string(), source_id: z.string(), location: z.string() }).optional(),
  generated_note: z.string().optional(), // «كيف فهمنا رسالتك»: موسوم مولَّداً (القاعدة 21)
  verify_link: z.string(),
});
export type ClaimResult = z.infer<typeof ClaimResultSchema>;

export const VerifyResponseSchema = z.object({
  request_id: z.string(),
  input_type: z.enum(["text", "image", "audio"]),
  transcript: z.object({ text: z.string(), clarity: z.number(), needs_confirmation: z.boolean() }).optional(),
  claims: z.array(ClaimResultSchema),
  reply_text: z.string(),
  telegram_text: z.string(),
  disclaimer: z.string(),
  status: z.enum(["ok", "needs_confirmation", "partial", "error"]),
  error: z.object({ code: z.string(), message_ar: z.string(), next_step_ar: z.string() }).optional(),
  timings_ms: z.record(z.string(), z.number()),
  /** استهلاك التوكنز وتكلفة الرسالة (تقني؛ القاعدة 26) */
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number(), cost_usd: z.number() }).optional(),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
