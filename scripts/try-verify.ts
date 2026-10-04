/**
 * مشغّل تطويري سريع: يمرّر حالات eval/dataset.jsonl النصية عبر verifyMessage() بـGemini الحقيقي ويقارن
 * بالأحكام المقبولة. ليس مشغّل التقييم الرسمي (المرحلة 3: eval/run-eval.ts).
 * الاستخدام: npm run try-verify -- [--ids T001,T016] [--limit N] [--conc 5] [--no-curated] [--verbose]
 */
import { readFileSync } from "node:fs";
import { lexicalOverlap } from "../lib/pipeline/retrieve";
import { verifyMessage } from "../lib/verify-message";
import type { ClaimResult } from "../lib/schemas/claim";

process.loadEnvFile(".env");

type Expected = { claim_hint: string; accept: string[]; level: string; curated_ref?: string };
type Row = { id: string; category: string; input_type: string; input: string; expected: Expected[]; critical?: boolean; synthetic?: boolean };

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const ids = opt("--ids")?.split(",");
const limit = Number(opt("--limit") ?? 1000);
const conc = Number(opt("--conc") ?? 5);
const verbose = args.includes("--verbose");

const rows: Row[] = readFileSync("eval/dataset.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Row)
  .filter((r) => r.input_type === "text" && (!ids || ids.includes(r.id)))
  .slice(0, limit);

function match(e: Expected, claims: ClaimResult[]): ClaimResult | undefined {
  if (e.accept.includes("refer_to_scholar")) return claims.find((c) => c.verdict === "refer_to_scholar");
  if (e.accept.includes("not_a_religious_claim")) return claims.find((c) => c.verdict === "not_a_religious_claim");
  return [...claims].sort((a, b) => lexicalOverlap(e.claim_hint, b.claim_text) - lexicalOverlap(e.claim_hint, a.claim_text))[0];
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const t0 = Date.now();
const results = await pool(rows, conc, async (r) => {
  const res = await verifyMessage({ type: "text", text: r.input }, { route: "try-verify" });
  return { r, res };
});

let pass = 0, total = 0, abstain = 0, critFail = 0, tokensIn = 0, tokensOut = 0, cost = 0;
const lat: number[] = [];
const fails: string[] = [];
for (const { r, res } of results) {
  tokensIn += res.usage?.input_tokens ?? 0;
  tokensOut += res.usage?.output_tokens ?? 0;
  cost += res.usage?.cost_usd ?? 0;
  lat.push(res.timings_ms.total ?? 0);
  for (const e of r.expected) {
    total++;
    const c = match(e, res.claims);
    const v = c?.verdict ?? `(${res.status}:${res.error?.code ?? "no-claim"})`;
    const ok = !!c && e.accept.includes(c.verdict);
    // ادعاء معروف (له curated_ref) أعاد النظام فيه not_found ⇒ امتناع يُحصى منفصلاً (CLAUDE.md §8)
    const isAbstain = !ok && v === "not_found_in_sources" && !!e.curated_ref;
    if (ok) pass++;
    else if (isAbstain) abstain++;
    else {
      fails.push(`${r.id}${r.critical ? "*" : ""} [${r.category}] متوقع ${e.accept.join("/")} ← ${v}${c?.downgrade_reason ? ` (${c.downgrade_reason})` : ""} conf=${c?.confidence ?? "-"}`);
      if (r.critical) critFail++;
    }
    if (verbose) console.log(`${ok ? "✓" : isAbstain ? "~" : "✗"} ${r.id} ${v} (${c?.confidence ?? "-"}) ${res.timings_ms.total}ms`);
  }
}
console.log(`\nالنتيجة: ${pass}/${total} إصابة | امتناع على معروف: ${abstain} | إخفاقات حرجة: ${critFail} | ${(pass / total * 100).toFixed(1)}%`);
console.log(`زمن ms: p50=${[...lat].sort((a, b) => a - b)[lat.length >> 1]} max=${Math.max(...lat)} | الكلي ${Date.now() - t0}ms | توكنز ${tokensIn}/${tokensOut} | التكلفة $${cost.toFixed(4)} (≈ $${(cost / rows.length).toFixed(4)}/رسالة)`);
if (fails.length) console.log(`\nالإخفاقات:\n${fails.join("\n")}`);
