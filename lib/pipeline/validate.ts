import { containsNormalized, normalizeArabic } from "@/lib/arabic/normalize";
import { QURAN_SOURCE_ID, verifyQuran } from "@/lib/quran/quran";
import type { Store } from "@/lib/retrieval/store";
import { POSITIVE_VERDICTS, type ClaimResult, type SourceRef } from "@/lib/schemas/claim";

export type ValidateCtx = {
  store: Store;
  /** معرّفات ما استرجعه الفهرس لهذا الادعاء (مداخل الكتب والمنتقى) */
  retrievedIds: Set<string>;
  /** المدخل المنتقى الذي بُني عليه الحكم (إن وُجد) */
  curatedId?: string;
};

const NUM = /رقم (\d+)/;

function sourceProblem(s: SourceRef, ctx: ValidateCtx): string | null {
  if (!s.quoted_text.trim()) return "empty_quote";
  if (s.source_id === QURAN_SOURCE_ID) {
    const m = verifyQuran(s.quoted_text);
    return m.kind === "verified" ? null : "quran_text_mismatch";
  }
  const n = NUM.exec(s.location)?.[1];
  const entry = n ? ctx.store.entries.get(`${s.source_id}#${n}`) : undefined;
  if (entry) {
    // مدخل مفهرس: يجب أن يكون ضمن نتائج الاسترجاع (مباشرة أو عبر مدخل منتقى استند إليه)
    if (!ctx.retrievedIds.has(entry.id) && !ctx.curatedId) return "source_not_in_results";
    if (!containsNormalized(entry.text, s.quoted_text)) return "quote_not_substring";
    if (s.grading_quote && !containsNormalized(entry.text, s.grading_quote)) return "grading_quote_not_substring";
    return null;
  }
  // كتاب غير مفهرس: لا يصح إلا عبر سجل منتقى بشري، ويُطابَق مع حقوله نفسها
  if (!ctx.curatedId) return "source_not_in_results";
  const cur = ctx.store.curated.get(ctx.curatedId.replace(/^curated#/, ""));
  const rec = cur?.sources.find((x) => x.source_id === s.source_id && x.location === s.location);
  if (!rec) return "source_not_in_curated_record";
  const own = [rec.quoted_text, rec.grading_quote].filter((x): x is string => !!x).map(normalizeArabic);
  const q = normalizeArabic(s.quoted_text);
  return own.some((o) => o.includes(q) || q.includes(o)) ? null : "quote_not_in_curated_record";
}

/**
 * الخطوة 6 (القاعدة 3): تحقق برمجي لاحق. أي حكم إيجابي يفشل مصدره يُخفَّض إلى `not_found_in_sources`.
 * ولا حكم إيجابي بلا مصدر، ولا `no_basis_per_scholar` بلا `grading_quote`.
 */
export function validateClaim(r: ClaimResult, ctx: ValidateCtx): ClaimResult {
  if (!POSITIVE_VERDICTS.includes(r.verdict)) return r;
  let problem: string | null = null;
  if (r.sources.length === 0) problem = "no_source";
  else if (r.verdict === "no_basis_per_scholar" && !r.sources.some((s) => s.grading_quote)) problem = "no_grading_quote";
  else {
    for (const s of r.sources) {
      problem = sourceProblem(s, ctx);
      if (problem) break;
    }
  }
  if (!problem) return r;
  return {
    ...r,
    verdict: "not_found_in_sources",
    confidence: 0,
    sources: [],
    authentic_alternative: undefined,
    checked_sources: ctx.store.indexedSources,
    failed_sources: [],
    review_status: "reviewed",
    downgrade_reason: `validation_failed:${problem}`,
  };
}
