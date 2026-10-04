/**
 * تقرير المطابقة المرتّبة على المراسي A001–A012 وحالاتها الـ72 (eval/wording_altered.jsonl) مقابل نص الصحيحين المفهرس.
 * يبرر قيمة NEAR_LCS_MIN. الاستخدام: npx tsx scripts/anchors-ordered-report.ts
 */
import { readFileSync } from "node:fs";
import { orderedMatch, NEAR_LCS_MIN, claimWords } from "../lib/pipeline/ordered-match";

const s = JSON.parse(readFileSync("data/index/store.json", "utf8"));
const entries = new Map<string, { text: string }>(s.entries.map((e: any) => [e.id, e]));
const cur = new Map<string, any>(s.curated.map((c: any) => [c.id, c]));
const rows = readFileSync("eval/wording_altered.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const stat: Record<string, { exact: number; near: number; far: number; minLcs: number; maxLcsNonExact: number; n: number }> = {};
let authenticLeak = 0;
for (const r of rows) {
  const c = cur.get(r.anchor)!;
  const src = c.sources.find((x: any) => /^sahih-/.test(x.source_id));
  const num = /رقم (\d+)/.exec(src.location)![1];
  const e = entries.get(`${src.source_id}#${num}`)!;
  const kind = r.id.split("-")[1];
  const m = orderedMatch(r.input, e.text, { matnOnly: true });
  const lcs = m.kind === "exact" ? 1 : m.lcsCov;
  const k = (stat[kind] ??= { exact: 0, near: 0, far: 0, minLcs: 9, maxLcsNonExact: 0, n: 0 });
  k.n++;
  k[m.kind]++;
  if (m.kind !== "exact") k.maxLcsNonExact = Math.max(k.maxLcsNonExact, lcs);
  k.minLcs = Math.min(k.minLcs, lcs);
  if (/^W/.test(r.id) && m.kind === "exact") { authenticLeak++; console.log("  ✗ تسرّب exact:", r.id, "|", r.input); }
  if (/^C/.test(r.id) && kind === "exact" && m.kind !== "exact") console.log("  ✗ ضابط لم يطابق:", r.id, "|", r.input, "|", m);
}
console.log(`NEAR_LCS_MIN = ${NEAR_LCS_MIN}`);
console.log("نوع الحالة | exact | near | far | أدنى LCS | أعلى LCS لغير exact");
for (const [k, v] of Object.entries(stat)) console.log(`${k.padEnd(8)} | ${v.exact} | ${v.near} | ${v.far} | ${v.minLcs.toFixed(2)} | ${v.maxLcsNonExact.toFixed(2)}  (n=${v.n})`);
console.log("تسرّب exact في المعدَّلة:", authenticLeak);
console.log("كلمات الادعاء (المراسي):", [...cur.values()].filter((c) => /^A\d+$/.test(c.id)).map((c) => `${c.id}:${claimWords(c.claim_text).length}`).join(" "));
