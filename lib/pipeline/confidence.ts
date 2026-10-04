/**
 * الثقة تُحسب برمجياً (القاعدة 13 / R5)، لا من تقدير النموذج، وتُقارن بـ CONFIDENCE_THRESHOLD:
 *
 *   confidence = 0.55·تطابق_المطلع + 0.15·تطابق_النص + 0.15·درجة_الاسترجاع_النسبية + 0.15·نجاح_التحقق
 *
 * - تطابق_المطلع: نسبة كلمات الادعاء الموجودة في أول 16 كلمة من المدخل (لفظ الحديث غالباً) أو في صيغ المنتقى.
 * - تطابق_النص: النسبة نفسها على المدخل كاملاً.
 * - درجة_الاسترجاع_النسبية: درجة المرشح المختار ÷ أعلى درجة في النتائج.
 * - نجاح_التحقق: 1 إن اجتاز التحقق من الاستشهاد (source_id ضمن النتائج، والاقتباس substring بعد التطبيع)، وإلا 0.
 * المعاملات أولية وتُعايَر بنتائج eval (docs/METHODOLOGY).
 */
export type ConfidenceInputs = { head: number; text: number; retrieval: number; citationOk: boolean };

export function computeConfidence(i: ConfidenceInputs): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const v = 0.55 * clamp(i.head) + 0.15 * clamp(i.text) + 0.15 * clamp(i.retrieval) + 0.15 * (i.citationOk ? 1 : 0);
  return Math.round(clamp(v) * 1000) / 1000;
}
