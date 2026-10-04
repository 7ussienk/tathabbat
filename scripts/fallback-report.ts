/**
 * تقرير بلا أي نداء Gemini (قرار 106): يفترض أن النموذج لم يختر مرشحاً (أسوأ حالة لمسار الـfallback) ويقيس متى يصدر wording_differs
 * على كل حالات التقييم. الادعاء المستخدم هو نص المدخل نفسه (تقريب: المستخرِج الحقيقي يحذف التقديم فقط).
 * الاستخدام: npx tsx scripts/fallback-report.ts [--nocurated] [--verbose]
 */
import { readFileSync } from "node:fs";
import { claimWords } from "../lib/pipeline/ordered-match";
import { fallbackNear } from "../lib/pipeline/ordered-check";
import { retrieve } from "../lib/pipeline/retrieve";
import { getStore } from "../lib/retrieval/store";

type Row = { id: string; category: string; input_type: string; input: string; critical?: boolean; expected: { accept: string[] }[] };
const rd = (f: string): Row[] => readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const rows = [...rd("eval/dataset.jsonl"), ...rd("eval/leakage.jsonl").filter((r) => r.input), ...rd("eval/wording_altered.jsonl")].filter((r) => r.input_type === "text");
const useCurated = !process.argv.includes("--nocurated");
const verbose = process.argv.includes("--verbose");
const store = await getStore();

const by = new Map<string, { n: number; hit: number; ids: string[] }>();
for (const r of rows) {
  const ret = retrieve(store, r.input, undefined, { curated: useCurated });
  const hits = fallbackNear(r.input, ret.candidates, store);
  const e = by.get(r.category) ?? { n: 0, hit: 0, ids: [] };
  e.n++;
  if (hits.length) {
    e.hit++;
    e.ids.push(`${r.id}(${claimWords(r.input).length}w,${hits.length}م)`);
  }
  by.set(r.category, e);
  if (verbose && hits.length) console.log(r.id, r.category, hits.map((h) => `${h.entry.id}:${h.cov.toFixed(2)}`).join(" "));
}
console.log(`الوضع: ${useCurated ? "مع curated" : "بدون curated"} | بلا نداء نموذج | أسوأ حالة (النموذج لم يختر مرشحاً)`);
console.log("| الفئة | الحالات | يصدر wording_differs | الحالات |");
console.log("|---|---|---|---|");
for (const [c, e] of [...by].sort()) console.log(`| ${c} | ${e.n} | ${e.hit} | ${e.ids.join("، ")} |`);
