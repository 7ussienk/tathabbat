import { normalizeArabic, tokenize } from "@/lib/arabic/normalize";
import type { BookEntry } from "@/lib/retrieval/chunk-maqasid";
import type { Store } from "@/lib/retrieval/store";
import { headOf, search, TOP_K } from "@/lib/retrieval/text-index";
import type { CuratedEntry } from "@/lib/schemas/curated";

export type Candidate =
  | { id: string; kind: "curated"; score: number; curated: CuratedEntry }
  | { id: string; kind: "book"; score: number; entry: BookEntry };

export type RetrieveResult = { candidates: Candidate[]; topScore: number };

/** مفاتيح مداخل الكتب التي يستند إليها مدخل منتقى (source_id#رقم) لمنع تكرارها مرشحاً حياً. */
export function curatedBookKeys(c: CuratedEntry): string[] {
  return c.sources
    .map((s) => {
      const n = /رقم (\d+)/.exec(s.location)?.[1];
      return n ? `${s.source_id}#${n}` : null;
    })
    .filter((x): x is string => !!x);
}

/**
 * الخطوة 4: بحث في الفهرس المحلي (تطبيع عربي، أفضل 10 نتائج)؛ مداخل `data/curated` (أحكام بشرية) تسبق.
 * لا شبكة. المدخل الحي الذي استند إليه مدخل منتقى ظاهر في النتائج يُستبعد حتى لا يُحكم عليه حياً.
 */
export function retrieve(store: Store, claimText: string, k = TOP_K, opts: { curated?: boolean } = {}): RetrieveResult {
  const useCurated = opts.curated !== false;
  const hits = search(store.index, claimText, k + 4, useCurated ? undefined : (r) => r.kind === "book");
  const topScore = hits[0]?.score ?? 0;
  const curatedHits = hits.filter((h) => h.kind === "curated");
  const covered = new Set<string>();
  for (const h of curatedHits) {
    const c = store.curated.get(h.id.replace(/^curated#/, ""));
    if (c) curatedBookKeys(c).forEach((key) => covered.add(key));
  }
  const out: Candidate[] = [];
  for (const h of hits) {
    if (h.kind === "curated") {
      const c = store.curated.get(h.id.replace(/^curated#/, ""));
      if (c) out.push({ id: h.id, kind: "curated", score: h.score, curated: c });
    } else {
      let e = store.entries.get(h.id);
      // مدخل الإحالة لا يحمل حكماً: يُستبدل بهدفه (الذي فيه الحكم)، ويُدمج إن كان الهدف حاضراً
      if (e?.ref_to) e = store.entries.get(`${e.source_id}#${e.ref_to}`) ?? e;
      if (e && !covered.has(e.id) && !out.some((x) => x.id === e!.id)) out.push({ id: e.id, kind: "book", score: h.score, entry: e });
    }
    if (out.length >= k) break;
  }
  return { candidates: out, topScore };
}

const toks = (x: string) => tokenize(normalizeArabic(x));

/** نسبة كلمات الادعاء (بعد التطبيع وإزالة السوابق والكلمات الوظيفية) الموجودة في `target`. */
export function lexicalOverlap(claim: string, target: string): number {
  const c = toks(claim);
  if (!c.length) return 0;
  const t = new Set(toks(target));
  return c.filter((w) => t.has(w)).length / c.length;
}

const MIN_FORM_TOKENS = 3;

/**
 * تطابق مع احتواء في الاتجاهين: نسبة كلمات الادعاء في الهدف، أو (إن كان الهدف صيغة معروفة من ≥3 كلمات)
 * نسبة كلمات الهدف في الادعاء — فادعاء يحوي الصيغة المعروفة كاملة وزيادة تفصيل لا يُظلم.
 */
export function containmentOverlap(claim: string, target: string): number {
  const forward = lexicalOverlap(claim, target);
  const tt = toks(target);
  if (tt.length < MIN_FORM_TOKENS) return forward;
  const cs = new Set(toks(claim));
  const reverse = tt.filter((w) => cs.has(w)).length / tt.length;
  return Math.max(forward, reverse);
}

/** نسب التطابق النصي بين الادعاء والمرشح: مع المطلع (لفظ الحديث) ومع النص كاملاً. */
export function overlapsFor(claim: string, cand: Candidate): { head: number; text: number } {
  if (cand.kind === "curated") {
    const forms = [cand.curated.claim_text, ...(cand.curated.aliases ?? [])];
    const best = Math.max(...forms.map((f) => containmentOverlap(claim, f)));
    return { head: best, text: best };
  }
  const aliases = (cand.entry.see_also ?? []).map((s) => containmentOverlap(claim, headOf(s.alias)));
  return { head: Math.max(containmentOverlap(claim, headOf(cand.entry.text)), ...aliases), text: lexicalOverlap(claim, cand.entry.text) };
}
