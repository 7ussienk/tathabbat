import { isAuthenticCollection } from "@/lib/pipeline/collections";
import { orderedMatch, type OrderedResult } from "@/lib/pipeline/ordered-match";
import type { Candidate } from "@/lib/pipeline/retrieve";
import type { BookEntry } from "@/lib/retrieval/chunk-maqasid";
import type { Store } from "@/lib/retrieval/store";
import type { CuratedEntry } from "@/lib/schemas/curated";

const rank = (x: OrderedResult) => (x.kind === "exact" ? 3 : x.kind === "near" ? 1 + x.lcsCov : x.lcsCov);
const best = (rs: OrderedResult[]) => rs.reduce((a, b) => (rank(b) > rank(a) ? b : a), { kind: "far", lcsCov: 0, runCov: 0 } as OrderedResult);

/**
 * فحص اللفظ بعد اختيار المرشح (scoring-2026-10-04.2): الادعاء يأخذ حكم المدخل **فقط** إن طابق لفظه لفظ المدخل مطابقة مرتّبة تامة؛
 * وإلا wording_differs (قريب) أو لا مطابقة (بعيد). أسماء aliases المنتقاة وأسماء مداخل الإحالة تُعدّ صيغاً تامة.
 */
export function checkEntry(claim: string, entry: BookEntry): OrderedResult {
  const rs = [orderedMatch(claim, entry.text, { matnOnly: isAuthenticCollection(entry.source_id) })];
  for (const s of entry.see_also ?? []) rs.push(orderedMatch(claim, s.alias));
  return best(rs);
}

export function checkCurated(claim: string, cur: CuratedEntry, store: Store): OrderedResult {
  const rs = [cur.claim_text, ...(cur.aliases ?? [])].map((f) => orderedMatch(claim, f));
  for (const s of cur.sources) {
    const n = /رقم (\d+)/.exec(s.location)?.[1];
    const e = n ? store.entries.get(`${s.source_id}#${n}`) : undefined;
    if (e) rs.push(checkEntry(claim, e));
  }
  return best(rs);
}

/** أول مدخل من الصحيحين ضمن المسترجَع يطابق لفظ الادعاء مطابقة تامة (الحديث يتكرر بألفاظ متقاربة؛ المرشح الذي اختاره النموذج قد لا يكون المطابق). */
export function exactCollection(claim: string, candidates: Candidate[]): Extract<Candidate, { kind: "book" }> | undefined {
  return candidates.find((c): c is Extract<Candidate, { kind: "book" }> => c.kind === "book" && isAuthenticCollection(c.entry.source_id) && checkEntry(claim, c.entry).kind === "exact");
}

/**
 * لعرض «لفظ المصدر» في wording_differs: أقرب مدخل لفظاً بين مدخل المرشح ومداخل الصحيحين المسترجعة (يُفضَّل الصحيحان عند التساوي لأنهما المصدر الأول للفظ).
 */
export function nearestEntry(claim: string, primary: BookEntry, candidates: Candidate[]): { entry: BookEntry; o: Extract<OrderedResult, { kind: "near" }> } | undefined {
  const pool: BookEntry[] = [primary, ...candidates.filter((c): c is Extract<Candidate, { kind: "book" }> => c.kind === "book" && isAuthenticCollection(c.entry.source_id) && c.entry.id !== primary.id).map((c) => c.entry)];
  let best: { entry: BookEntry; o: Extract<OrderedResult, { kind: "near" }>; score: number } | undefined;
  for (const entry of pool) {
    const o = checkEntry(claim, entry);
    if (o.kind !== "near") continue;
    const score = o.lcsCov + o.bagCov + (isAuthenticCollection(entry.source_id) ? 0.01 : 0);
    if (!best || score > best.score) best = { entry, o, score };
  }
  return best && { entry: best.entry, o: best.o };
}
