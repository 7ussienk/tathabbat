/**
 * واجهة محدد المعدل (القرار 58). التنفيذ الافتراضي في الذاكرة وهو **تقريبي لكل نسخة** (كل نسخة serverless
 * لها عدّادها)، وسقف Google/الرصيد المدفوع هو الحد الأعلى الفعلي. مخزن Upstash اختياري يُضاف الاثنين.
 */
export interface RateLimitStore {
  /** يسجّل ضربة للمفتاح ويعيد عدد الضربات داخل النافذة (شاملةً هذه). */
  hit(key: string, windowMs: number, now?: number): Promise<number>;
}
