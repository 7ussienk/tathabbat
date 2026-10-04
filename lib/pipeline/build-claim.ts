import { extractLiteral, normalizeArabic, tokenize } from "@/lib/arabic/normalize";
import { isAuthenticCollection } from "@/lib/pipeline/collections";
import { matnCharStart, type OrderedResult } from "@/lib/pipeline/ordered-match";
import type { CuratedEntry } from "@/lib/schemas/curated";
import { containmentOverlap } from "@/lib/pipeline/retrieve";
import { headOf } from "@/lib/retrieval/text-index";
import { decideVerdict, type LexClass } from "@/lib/pipeline/verdict-lexicon";
import type { CollectionHit, JudgeDecision } from "@/lib/pipeline/judge";
import { QURAN_SOURCE_ID, skeletonWords, type QuranMatch } from "@/lib/quran/quran";
import type { BookEntry } from "@/lib/retrieval/chunk-maqasid";
import type { Store } from "@/lib/retrieval/store";
import type { ClaimResult, SourceRef, Verdict } from "@/lib/schemas/claim";
import type { ExtractOutput } from "@/lib/schemas/llm";
import { verifyLink } from "@/lib/verify-link";

export type ExtractedClaim = ExtractOutput["claims"][number];

const EXCERPT_MAX = 1200;

/** «السخاوي (ت 902هـ)» ← «السخاوي» */
export const displayAuthor = (a?: string) => a?.replace(/\s*\([^)]*\)\s*$/, "").trim() || undefined;

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
      author: displayAuthor(meta?.author),
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
  let reviewTerms: string[] = [];
  if (literal && c.content_level !== "B") {
    const lex = decideVerdict(literal, d.proposed as LexClass | "none");
    verdict = lex.verdict;
    reviewTerms = lex.needs_scholar_review;
  }
  // مدخل بلغته إحالة: اللفظ المسؤول عنه ورد في مدخل إحالة، والحكم في الهدف. نذكر المدخلين، والاقتباس من الهدف.
  const viaStub = (e.see_also ?? [])
    .map((s) => ({ s, o: containmentOverlap(c.claim_text, headOf(s.alias)) }))
    .filter((x) => x.o > containmentOverlap(c.claim_text, headOf(e.text)))
    .sort((a, b) => b.o - a.o)[0]?.s;
  const src: SourceRef = {
    source_id: e.source_id,
    title: meta?.title ?? e.source_id,
    author: displayAuthor(meta?.author),
    location: e.location,
    quoted_text: excerpt(e.text, literal),
    grading_quote: literal ?? undefined,
    attribution_note: viaStub ? `ورد لفظ الادعاء في مدخل إحالة (رقم ${viaStub.number}): «${viaStub.text}»، والحكم في المدخل رقم ${e.number} المنقول أعلاه.` : undefined,
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
    lexicon_review_terms: reviewTerms.length ? reviewTerms : undefined,
  };
}

/** نافذة متصلة (≤ max حرفاً) من نص المدخل حرفياً تضم أكثر كلمات الادعاء؛ لا دمج مقاطع منفصلة. */
export function bestWindow(text: string, claim: string, max = EXCERPT_MAX): string {
  if (text.length <= max) return text;
  const want = new Set(tokenize(normalizeArabic(claim)));
  const words: { start: number; end: number; hit: boolean }[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const t = tokenize(normalizeArabic(m[0]));
    words.push({ start: m.index!, end: m.index! + m[0].length, hit: t.some((x) => want.has(x)) });
  }
  let best = { i: 0, j: 0, score: -1 };
  let j = 0;
  let score = 0;
  for (let i = 0; i < words.length; i++) {
    while (j < words.length && words[j].end - words[i].start <= max) {
      if (words[j].hit) score++;
      j++;
    }
    if (score > best.score) best = { i, j, score };
    if (words[i].hit) score--;
  }
  const a = words[best.i]?.start ?? 0;
  const b = words[Math.max(best.i, best.j - 1)]?.end ?? Math.min(text.length, max);
  return text.slice(a, b);
}

/** نص تنبيه wording_differs (قرار 4 أكتوبر): لا يُوصف الادعاء بالخطأ ولا بالكذب. */
export const WORDING_NOTE = "هذا لفظ المصدر نفسه. وقد يكون ما وصلك روايةً أخرى للحديث؛ فلا نصف ما أُرسل إليك بالخطأ ولا بالكذب، لكننا لا نستطيع الحكم عليه بلفظه هذا.";

const withMatn = (src: SourceRef): SourceRef => {
  if (!isAuthenticCollection(src.source_id)) return src;
  const at = matnCharStart(src.quoted_text);
  return at ? { ...src, matn_from: at } : src;
};

/** مصدر من مدخل في كتاب (الصحيحان أو المقاصد): نص حرفي متصل من المدخل حول موضع الادعاء، مع بداية المتن للصحيحين. */
function entrySource(c: ExtractedClaim, store: Store, e: BookEntry, note?: string): SourceRef {
  const meta = store.sourceMeta[e.source_id];
  return withMatn({
    source_id: e.source_id,
    title: meta?.title ?? e.source_id,
    author: displayAuthor(meta?.author),
    location: e.location,
    quoted_text: bestWindow(e.text, c.claim_text),
    attribution_note: note,
    url: turathUrl(store, e),
  });
}

const reviewOf = (store: Store, sourceId: string): ClaimResult["review_status"] => (store.sourceMeta[sourceId]?.reviewed ? "reviewed" : "pending_review");

/** الصحيحان، مطابقة مرتّبة تامة: `authentic` (والحكم مبني على وجود الرواية بلفظها لا على اجتهاد الأداة). */
export function buildCollection(c: ExtractedClaim, idx: number, d: Extract<JudgeDecision, { kind: "collection" }>, store: Store): ClaimResult {
  const e = d.hit.candidate.entry;
  return {
    ...base(c, idx),
    verdict: "authentic",
    confidence: d.confidence,
    sources: [entrySource(c, store, e, `وردت هذه الرواية في «${store.sourceMeta[e.source_id]?.title ?? e.source_id}» بالموضع المذكور، ولفظ ادعائك مطابق للفظها كلمةً بكلمة وبالترتيب نفسه. والحكم هنا مبني على وجودها فيه لا على اجتهاد الأداة.`)],
    checked_sources: checkedSources(store),
    failed_sources: [],
    review_status: reviewOf(store, e.source_id),
  };
}

/**
 * مدخل حي من كتب الأحكام مع مدخل من الصحيحين مطابق اللفظ تماماً للحديث نفسه: إن لم يحمل كلام العالم حكماً مصنَّفاً فالصحيحان
 * يثبتان `authentic`؛ وإن حمل حكماً سلبياً (موضوع/لا أصل له/ضعيف…) فتعارض المصدرين ⟵ `disputed` بعرضهما معاً.
 */
export function mergeCollection(live: ClaimResult, c: ExtractedClaim, idx: number, hit: CollectionHit, store: Store): ClaimResult {
  const e = hit.candidate.entry;
  const src = entrySource(c, store, e);
  if (live.verdict === "scholar_text_only") {
    return { ...live, verdict: "authentic", confidence: Math.max(live.confidence, hit.confidence), sources: [src], review_status: reviewOf(store, e.source_id) };
  }
  return { ...live, verdict: "disputed", sources: [...live.sources, src], id: `c${idx + 1}` };
}

/** اللفظ يختلف: يُعرض لفظ المصدر حرفياً مع موضعه بلا حكم المدخل (weak وغيره) ولا وصف الادعاء بالخطأ. */
function wording(c: ExtractedClaim, idx: number, store: Store, sources: SourceRef[], confidence: number, review: ClaimResult["review_status"], reason: string): ClaimResult {
  return {
    ...base(c, idx),
    verdict: "wording_differs",
    confidence,
    sources: sources.map((s) => ({ ...s, grading_quote: undefined, attribution_note: s.attribution_note ?? WORDING_NOTE })),
    checked_sources: checkedSources(store),
    failed_sources: [],
    review_status: review,
    downgrade_reason: reason,
  };
}

export function buildWordingFromEntry(c: ExtractedClaim, idx: number, store: Store, e: BookEntry, confidence: number, o: Extract<OrderedResult, { kind: "near" }>): ClaimResult {
  return wording(c, idx, store, [entrySource(c, store, e, WORDING_NOTE)], confidence, reviewOf(store, e.source_id), `wording:${o.why}:lcs=${o.lcsCov.toFixed(2)}`);
}

/** ملاحظة ثابتة من الكود (ليست مولَّدة) حين تطابقت كلمات الادعاء مع مواضع دون أن يختار النموذج حديثاً بعينه. */
export const FALLBACK_NOTE = "لم نستطع الجزم بأي حديث تقصد: كلمات رسالتك وردت متجاورة في المواضع المعروضة أدناه دون أن تطابق لفظها كاملاً. إن كنت تقصد حديثاً بعينه فالصق نصه كاملاً ليُقارَن لفظه بالمصدر.";

export function buildWordingFallback(c: ExtractedClaim, idx: number, store: Store, hits: { entry: BookEntry; cov: number }[], reason: string): ClaimResult {
  const sources = hits.map((h) => ({ ...entrySource(c, store, h.entry), attribution_note: "" }));
  const r = wording(c, idx, store, sources, Math.round((0.5 + 0.2 * hits[0].cov) * 100) / 100, hits.some((h) => reviewOf(store, h.entry.source_id) === "pending_review") ? "pending_review" : "reviewed", `wording:fallback:${reason}:cov=${hits[0].cov.toFixed(2)}`);
  return { ...r, system_note: FALLBACK_NOTE };
}

export function buildWordingFromCurated(c: ExtractedClaim, idx: number, store: Store, cur: CuratedEntry, confidence: number, o: Extract<OrderedResult, { kind: "near" }>): ClaimResult {
  const sources: SourceRef[] = cur.sources.map((s) => {
    const n = STORE_NUM.exec(s.location)?.[1];
    const entry = n ? store.entries.get(`${s.source_id}#${n}`) : undefined;
    if (entry) return entrySource(c, store, entry, WORDING_NOTE);
    const meta = store.sourceMeta[s.source_id];
    // كتاب غير مفهرس: لفظ المنتقى البشري المعتمد (من السجل) لا حكم المؤلف
    return { source_id: s.source_id, title: meta?.title ?? s.source_id, author: displayAuthor(meta?.author), location: s.location, quoted_text: s.quoted_text ?? cur.claim_text, attribution_note: WORDING_NOTE, url: s.url };
  });
  return wording(c, idx, store, sources, confidence, cur.reviewed ? "reviewed" : "pending_review", `wording:curated:lcs=${o.lcsCov.toFixed(2)}`);
}
