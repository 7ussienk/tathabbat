import { z } from "zod";
import { CLAIM_TYPES, CONTENT_LEVELS } from "@/lib/schemas/claim";

/** مخرجات خطوتي الاستخراج والتصنيف (استدعاء واحد: PLAN §4 R3). */
export const ExtractOutputSchema = z.object({
  claims: z.array(
    z.object({
      claim_text: z.string(),
      claim_type: z.enum(CLAIM_TYPES),
      content_level: z.enum(CONTENT_LEVELS),
      /** «كيف فهمنا رسالتك»: سطر قصير يعيد صياغة الادعاء دون إضافة حكم أو معلومة شرعية */
      understood_as: z.string(),
    }),
  ),
});
export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;

export const PROPOSED_CLASSES = ["fabricated", "no_basis_per_scholar", "weak", "none"] as const;

/**
 * مخرجات الحكم: النموذج يختار المرشح ويقترح جملة الحكم حرفياً وتصنيفاً؛ الكود يتحقق ويقتطع (القاعدة 21).
 * curated_id و book_id منفصلان: إن تناول مرشحان الحديث نفسه يسبق المنتقى (حكم بشري) برمجياً.
 */
export const JudgeOutputSchema = z.object({
  curated_id: z.string().nullable(),
  book_id: z.string().nullable(),
  grading_sentence: z.string().nullable(),
  proposed_class: z.enum(PROPOSED_CLASSES),
});
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;
