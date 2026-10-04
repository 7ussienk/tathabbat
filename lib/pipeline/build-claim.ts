import { extractLiteral } from "@/lib/arabic/normalize";
import { decideVerdict, type LexClass } from "@/lib/pipeline/verdict-lexicon";
import type { JudgeDecision } from "@/lib/pipeline/judge";
import { QURAN_SOURCE_ID, skeletonWords, type QuranMatch } from "@/lib/quran/quran";
import type { BookEntry } from "@/lib/retrieval/chunk-maqasid";
import type { Store } from "@/lib/retrieval/store";
import type { ClaimResult, SourceRef, Verdict } from "@/lib/schemas/claim";
import type { ExtractOutput } from "@/lib/schemas/llm";
import { verifyLink } from "@/lib/verify-link";

export type ExtractedClaim = ExtractOutput["claims"][number];

const EXCERPT_MAX = 1200;

export function turathUrl(store: Store, e: BookEntry): string | undefined {
  const tid = store.sourceMeta[e.source_id]?.turath_book_id;
  return tid ? `https://app.turath.io/book/${tid}?page=${e.page_id_start}` : undefined;
}

/** مقطع متصل من نص المدخل حرفياً: كله إن قصر، وإلا نافذة حول الجملة المقتبسة (لا دمج مقاطع منفصلة). */
export function excerpt(text: string, literal: string | null, max = EXCERPT_MAX): string {
  if (text.length <= max) return text;
  const at = literal ? text.indexOf(literal) : 0;
  const mid = Math.max(0, at);
  let start = Math.max(0, mid - Math.floor((max - (literal?.length ?? 0)) / 2));
  let end = Math.min(text.length, start + max);
  start = Math.max(0, end - max);
  const sp = text.indexOf(" ", start);
  if (start > 0 && sp >= 0 && sp < mid) start = sp + 1;
  const sp2 = text.lastIndexOf(" ", end);
  if (end < text.length && sp2 > mid + (literal?.length ?? 0)) end = sp2;
  return text.slice(start, end);
}

export function checkedSources(store: Store): string[] {
  return store.indexedSources;
}

function base(c: ExtractedClaim, idx: number): Pick<ClaimResult, "id" | "claim_text" | "claim_type" | "content_level" | "generated_note" | "verify_link"> {
  return {
    id: `c${idx + 1}`,
    claim_text: c.claim_text,
    claim_type: c.claim_type,
    content_level: c.content_level,
    generated_note: c.understood_as?.trim() || undefined,
    verify_link: verifyLink(c.claim_text),
  };
}

export function buildNotFound(c: ExtractedClaim, idx: number, store: Store, reason: string, confidence = 0): ClaimResult {
  return {
    ...base(c, idx),
    verdict: "not_found_in_sources",
    confidence,
    sources: [],
    checked_sources: checkedSources(store),
    failed_sources: [],
    review_status: "reviewed", // لا حكم شرعي هنا؛ لا شيء ينتظر مراجعة
    downgrade_reason: reason,
  };
}

export function buildSearchUnavailable(c: ExtractedClaim, idx: number, failed: string[]): ClaimResult {
  return {
    ...base(c, idx),
    verdict: "search_unavailable",
    confidence: 0,
    sources: [],
    checked_sources: [],
    failed_sources: failed,
    review_status: "reviewed",
    downgrade_reason: "index_unavailable",
  };
}

/** المستوى «د»: لا استرجاع ولا حكم، إحالة فقط. */
export function buildRefer(c: ExtractedClaim, idx: number): ClaimResult {
  return { ...base(c, idx), content_level: "D", verdict: "refer_to_scholar", confidence: 1, sources: [], review_status: "reviewed" };
}

export function buildNotReligious(text: string): ClaimResult {
  return {
    id: "c1",
    claim_text: text.trim().slice(0, 300),
    claim_type: "other",
    content_level: "A",
    verdict: "not_a_religious_claim",
    confidence: 1,
    sources: [],
    review_status: "reviewed",
    verify_link: verifyLink(text),
  };
}

export function buildQuran(c: ExtractedClaim, idx: number, m: Exclude<QuranMatch, { kind: "none" }>): ClaimResult {
  const n = skeletonWords(c.claim_text).length;
  const src: SourceRef = {
    source_id: QURAN_SOURCE_ID,
    title: "القرآن الكريم (رواية حفص)",
    location: m.location,
    quoted_text: m.text,
  };
  return {
    ...base(c, idx),
    content_level: "A",
    verdict: m.kind === "verified" ? "quran_verified" : "quran_misquoted",
    confidence: m.kind === "verified" ? 1 : Math.max(0, Math.round((1 - m.distance / n) * 1000) / 1000),
    sources: [src],
    review_status: "reviewed", // نص مطابق حرفياً لملف Tanzil المحلي برمجياً
    authentic_alternative: m.kind === "misquoted" ? { text: m.text, source_id: QURAN_SOURCE_ID, location: m.location } : undefined,
  };
}

const STORE_NUM = /رقم (\d+)/;

/** مدخل منتقى (حكم بشري): الحكم والمصادر من السجل نفسه، ونص المدخل المقتبس يُقتطع حرفياً من الفهرس إن كان الكتاب مفهرساً. */
export function buildCurated(c: ExtractedClaim, idx: number, d: Extract<JudgeDecision, { kind: "curated" }>, store: Store): ClaimResult {
  const cur = d.candidate.curated;
  const sources: SourceRef[] = cur.sources.map((s) => {
    const meta = store.sourceMeta[s.source_id];
    const n = STORE_NUM.exec(s.location)?.[1];
    const entry = n ? store.entries.get(`${s.source_id}#${n}`) : undefined;
    const literal = entry && s.grading_quote ? extractLiteral(entry.text, s.grading_quote) : null;
    return {
      source_id: s.source_id,
      title: meta?.title ?? s.source_id,
      location: s.location,
      quoted_text: entry ? excerpt(entry.text, literal) : (s.quoted_text ?? s.grading_quote ?? ""),
      grading_quote: s.grading_quote,
      attribution_note: s.attribution_note,
      url: s.url,
    };
  });
  const alt = cur.authentic_alternative;
  return {
    ...base(c, idx),
    content_level: cur.level,
    verdict: cur.verdict as Verdict,
    confidence: d.confidence,
    sources,
    checked_sources: checkedSources(store),
    failed_sources: [],
    review_status: cur.reviewed ? "reviewed" : "pending_review",
    authentic_alternative: alt ? { text: alt.text, source_id: alt.source_id, location: alt.location } : undefined,
  };
}

/** مدخل حي من الفهرس: النموذج اقترح جملة وتصنيفاً، والكود يقتطع الجملة حرفياً ويحكم بالمعجم الثابت (القاعدة 21). */
export function buildLive(c: ExtractedClaim, idx: number, d: Extract<JudgeDecision, { kind: "book" }>, store: Store): ClaimResult {
  const e = d.candidate.entry;
  const literal = d.sentence ? extractLiteral(e.text, d.sentence) : null;
  if (d.sentence && !literal) return buildNotFound(c, idx, store, "quote_not_substring", d.confidence * 0.5);
  const meta = store.sourceMeta[e.source_id];
  let verdict: Verdict = "scholar_text_only";
  if (literal && c.content_level !== "B") {
    verdict = decideVerdict(literal, d.proposed as LexClass | "none").verdict;
  }
  const src: SourceRef = {
    source_id: e.source_id,
    title: meta?.title ?? e.source_id,
    location: e.location,
    quoted_text: excerpt(e.text, literal),
    grading_quote: literal ?? undefined,
    url: turathUrl(store, e),
  };
  return {
    ...base(c, idx),
    verdict,
    confidence: d.confidence,
    sources: [src],
    checked_sources: checkedSources(store),
    failed_sources: [],
    review_status: meta?.reviewed ? "reviewed" : "pending_review",
  };
}
