import { BUKHARI_SPEC, MUSLIM_SPEC } from "@/lib/retrieval/chunk-hadith";

/** عدد المداخل المتوقع لكل كتاب مفهرس (يفشل البناء والفحص العميق إن اختلف). المقاصد: 1..1356 عدا 406. */
export const EXPECTED_ENTRIES: Record<string, number> = {
  "maqasid-sakhawi": 1355,
  "sahih-bukhari": BUKHARI_SPEC.expectedEntries,
  "sahih-muslim": MUSLIM_SPEC.expectedEntries,
};
export const EXPECTED_TOTAL = Object.values(EXPECTED_ENTRIES).reduce((a, b) => a + b, 0);
