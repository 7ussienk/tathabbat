/**
 * الفهرس المحلي (MiniSearch) على النص بعد التطبيع العربي — القاعدتان 22 و23.
 * يُبنى وقت `npm run build` (scripts/build-index.ts) ويُحمَّل في الذاكرة وقت التشغيل؛ لا شبكة.
 * يضم مداخل الكتب المجلوبة (kind=book) ومداخل data/curated (kind=curated).
 */
import MiniSearch, { type Options, type SearchResult } from "minisearch";
import { normalizeArabic, tokenize } from "@/lib/arabic/normalize";
import type { BookEntry } from "@/lib/retrieval/chunk-maqasid";
import type { CuratedEntry } from "@/lib/schemas/curated";

export type IndexKind = "book" | "curated";

export type IndexDoc = {
  id: string; // maqasid-sakhawi#125 | curated#W001
  kind: IndexKind;
  source_id: string;
  head: string; // مطلع المدخل (لفظ الحديث غالباً) — يُرجَّح
  text: string; // النص المُطبَّع الكامل
};

const HEAD_WORDS = 16;

export function headOf(rawText: string): string {
  const t = rawText.replace(/^حديث\s*:\s*/, "");
  return normalizeArabic(t).split(" ").slice(0, HEAD_WORDS).join(" ");
}

export function bookDoc(e: BookEntry): IndexDoc {
  return { id: e.id, kind: "book", source_id: e.source_id, head: headOf(e.text), text: normalizeArabic(e.text) };
}

export function curatedDoc(c: CuratedEntry): IndexDoc {
  const forms = [c.claim_text, ...(c.aliases ?? [])];
  const text = normalizeArabic(forms.join(" "));
  return { id: `curated#${c.id}`, kind: "curated", source_id: "curated", head: normalizeArabic(c.claim_text), text };
}

export const MINISEARCH_OPTIONS: Options<IndexDoc> = {
  fields: ["head", "text"],
  storeFields: ["kind", "source_id"],
  // المدخلات مطبَّعة سلفاً؛ tokenize يطبّق إزالة السوابق (ال…) والكلمات الوظيفية على الفهرس والاستعلام
  tokenize: (s) => tokenize(s),
  processTerm: (t) => t,
  searchOptions: {
    boost: { head: 3 },
    combineWith: "OR",
    fuzzy: (term) => (term.length >= 6 ? 0.15 : false),
    prefix: false,
  },
};

export function buildIndex(docs: IndexDoc[]): MiniSearch<IndexDoc> {
  const ms = new MiniSearch<IndexDoc>(MINISEARCH_OPTIONS);
  ms.addAll(docs);
  return ms;
}

export function loadIndex(json: string): MiniSearch<IndexDoc> {
  return MiniSearch.loadJSON<IndexDoc>(json, MINISEARCH_OPTIONS);
}

export type Hit = { id: string; kind: IndexKind; source_id: string; score: number };

export const TOP_K = 10;

export function search(index: MiniSearch<IndexDoc>, query: string, k = TOP_K, filter?: (r: SearchResult) => boolean): Hit[] {
  const q = normalizeArabic(query);
  if (!q) return [];
  return index
    .search(q, filter ? { filter } : undefined)
    .slice(0, k)
    .map((r) => ({ id: r.id as string, kind: r.kind as IndexKind, source_id: r.source_id as string, score: r.score }));
}
