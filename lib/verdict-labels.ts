import type { Verdict } from "@/lib/schemas/claim";

/** تسميات الأحكام المعروضة (docs/DESIGN.md §6)، ودلالتها اللونية. */
export const VERDICT_LABELS: Record<Verdict, { label: string; tone: "ok" | "warn" | "danger" | "info" | "neutral" }> = {
  authentic: { label: "صحيح", tone: "ok" },
  weak: { label: "ضعيف", tone: "warn" },
  fabricated: { label: "موضوع", tone: "danger" },
  no_basis_per_scholar: { label: "لا أصل له (حكم منقول)", tone: "danger" },
  disputed: { label: "مختلف في الحكم عليه", tone: "warn" },
  misattributed: { label: "ليس من كلام النبي ﷺ، ويُنسب لغيره", tone: "warn" },
  not_found_in_sources: { label: "لم نجد له أصلاً في المصادر المعتمدة التي فُحصت", tone: "neutral" },
  search_unavailable: { label: "تعذّر البحث الآن، حاول بعد قليل", tone: "neutral" },
  scholar_text_only: { label: "نص كلام الإمام (بلا تصنيف آلي)", tone: "info" },
  quran_verified: { label: "نص الآية صحيح", tone: "ok" },
  quran_misquoted: { label: "في نص الآية خطأ، وهذا الصحيح", tone: "warn" },
  refer_to_scholar: { label: "هذا يحتاج سؤال عالم أو جهة إفتاء رسمية", tone: "info" },
  not_a_religious_claim: { label: "لا يوجد ادعاء ديني للتحقق منه", tone: "neutral" },
};
