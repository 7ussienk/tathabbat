/**
 * مشغّل تطويري سريع: يمرّ حالات eval/dataset.jsonl النصية عبر verifyMessage() بـGemini الحقيقي ويقارن
 * بالأحكام المقبولة. ليس مشغّل التقييم الرسمي (المرحلة 4: eval/run-eval.ts).
 *
 * الاستخدام: npm run try-verify -- [--ids T001,T016] [--limit N] [--conc 5] [--no-curated]
 *                                   [--remote https://tathabbat.vercel.app] [--verbose]
 *  --no-curated : يتجاهل data/curated (القرار 51)، فتُحسم الحالات من الفهرس الحي وحده
 *  --remote URL : يستدعي /api/machine/verify على النشر (يتطلب VERIFY_API_TOKEN في .env) ويقيس الزمن الفعلي
 * يحلل أيضاً مكان الفشل: فشل استرجاع (المدخل الصحيح خارج أفضل 10) أم فشل اختيار أم حكم مخالف.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { lexicalOverlap, retrieve } from "../lib/pipeline/retrieve";
import { getStore } from "../lib/retrieval/store";
import type { ClaimResult, VerifyResponse } from "../lib/schemas/claim";
import { verifyMessage } from "../lib/verify-message";

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
const noCurated = args.includes("--no-curated");
const remote = opt("--remote");
const outFile = opt("--out");

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

async function call(text: string): Promise<{ res: VerifyResponse; wall: number }> {
  const t = Date.now();
  if (!remote) return { res: await verifyMessage({ type: "text", text }, { route: "try-verify", useCurated: !noCurated }), wall: Date.now() - t };
  // أخطاء الشبكة المحلية (DNS) تُعاد ولا تُحتسب في زمن الخادم؛ الزمن المسجَّل لآخر محاولة ناجحة
  for (let attempt = 1; ; attempt++) {
    const ta = Date.now();
    try {
      const r = await fetch(`${remote}/api/machine/verify`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${process.env.VERIFY_API_TOKEN}` },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(70_000),
      });
      return { res: (await r.json()) as VerifyResponse, wall: Date.now() - ta };
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
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

const store = await getStore();
/** مداخل المقاصد التي يستند إليها المنتقى لهذه الحالة (الأهداف الصحيحة للاسترجاع). */
function targets(ref?: string): string[] {
  const c = ref ? store.curated.get(ref) : undefined;
  if (!c) return [];
  return c.sources
    .filter((s) => s.source_id === "maqasid-sakhawi")
    .map((s) => /رقم (\d+)/.exec(s.location)?.[1])
    .filter((n): n is string => !!n)
    .map((n) => `maqasid-sakhawi#${n}`);
}

const t0 = Date.now();
const results = await pool(rows, conc, async (r) => ({ r, ...(await call(r.input)) }));

type Cat = { hit: number; total: number; abstain: number };
const byCat = new Map<string, Cat>();
let pass = 0, total = 0, abstain = 0, critFail = 0, tokensIn = 0, tokensOut = 0, cost = 0;
let reachable = 0, reachableHit = 0, retrievalMiss = 0, judgeMiss = 0, wrongVerdict = 0, unindexed = 0;
const walls: number[] = [];
const server: number[] = [];
const lines: string[] = [];
const dump: unknown[] = [];

for (const { r, res, wall } of results) {
  tokensIn += res.usage?.input_tokens ?? 0;
  tokensOut += res.usage?.output_tokens ?? 0;
  cost += res.usage?.cost_usd ?? 0;
  walls.push(wall);
  server.push(res.timings_ms?.total ?? 0);
  for (const e of r.expected) {
    total++;
    const cat = byCat.get(r.category) ?? { hit: 0, total: 0, abstain: 0 };
    cat.total++;
    byCat.set(r.category, cat);
    const c = match(e, res.claims ?? []);
    const v = c?.verdict ?? `(${res.status}:${res.error?.code ?? "no-claim"})`;
    const ok = !!c && e.accept.includes(c.verdict);
    const known = !!e.curated_ref;
    const isAbstain = !ok && v === "not_found_in_sources" && known;
    const tg = targets(e.curated_ref);
    const isRetrievalCase = known && !e.accept.includes("quran_verified") && !e.accept.includes("quran_misquoted") && !e.accept.includes("refer_to_scholar");

    if (isRetrievalCase && tg.length) {
      reachable++;
      if (ok) reachableHit++;
    } else if (isRetrievalCase && !tg.length) {
      unindexed++; // الكتاب المصدر غير مفهرس (الصحيحان، لسان الميزان…): لا يبلغها إلا المنتقى
    }
    let why = "";
    if (!ok && isRetrievalCase && tg.length) {
      const q = c?.claim_text ?? e.claim_hint;
      const cands = retrieve(store, q, undefined, { curated: !noCurated }).candidates.map((x) => x.id);
      const inTop = tg.some((t) => cands.includes(t));
      if (!inTop) { why = "retrieval_miss"; retrievalMiss++; }
      else if (v === "not_found_in_sources") { why = "judge_or_confidence_miss"; judgeMiss++; }
      else { why = "wrong_verdict"; wrongVerdict++; }
    }
    if (ok) { pass++; cat.hit++; }
    else if (isAbstain) { abstain++; cat.abstain++; }
    else if (r.critical) critFail++;
    const mark = ok ? "✓" : isAbstain ? "~" : "✗";
    lines.push(`${mark} ${r.id}${r.critical ? "*" : ""} [${r.category}] متوقع ${e.accept.join("/")} ← ${v}${c?.downgrade_reason ? ` (${c.downgrade_reason})` : ""} conf=${c?.confidence ?? "-"}${why ? ` ⟵ ${why}` : ""}${isAbstain && !tg.length ? " ⟵ كتاب غير مفهرس" : ""} | ${wall}ms`);
    dump.push({ id: r.id, category: r.category, critical: !!r.critical, synthetic: !!r.synthetic, accept: e.accept, verdict: v, ok, abstain: isAbstain, conf: c?.confidence, downgrade: c?.downgrade_reason, why, wall_ms: wall, server_ms: res.timings_ms?.total, cost: res.usage?.cost_usd });
  }
}

const pctl = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;
if (verbose) console.log(lines.join("\n"));
console.log(`\nالوضع: ${remote ? `remote ${remote}` : "محلي"} | ${noCurated ? "بدون curated" : "مع curated"} | ${rows.length} رسالة`);
console.log(`النتيجة: ${pass}/${total} إصابة (${((pass / total) * 100).toFixed(1)}%) | امتناع على معروف: ${abstain} | إخفاقات حرجة: ${critFail}`);
console.log(`حالات استرجاعية بكتاب مفهرس (المقاصد): ${reachableHit}/${reachable} | حالات كتابها غير مفهرس: ${unindexed}`);
console.log(`مواضع الفشل (بين الحالات الاسترجاعية غير المصابة): فشل استرجاع=${retrievalMiss} | المدخل ضمن أفضل 10 لكن امتناع=${judgeMiss} | حكم مخالف=${wrongVerdict}`);
console.log("حسب الفئة (إصابة/كلي، امتناع):");
for (const [k, v] of byCat) console.log(`  ${k}: ${v.hit}/${v.total}${v.abstain ? `، امتناع ${v.abstain}` : ""}`);
console.log(`زمن الاستجابة ms (${remote ? "من العميل شاملاً الشبكة" : "محلي"}): وسيط=${pctl(walls, 50)} p95=${pctl(walls, 95)} أقصى=${Math.max(...walls)} | خادم: وسيط=${pctl(server, 50)} أقصى=${Math.max(...server)} | الكلي ${Date.now() - t0}ms`);
console.log(`توكنز ${tokensIn}/${tokensOut} | التكلفة $${cost.toFixed(4)} (≈ $${(cost / rows.length).toFixed(4)}/رسالة)`);
const bad = lines.filter((l) => !l.startsWith("✓"));
if (bad.length) console.log(`\nغير المصاب:\n${bad.join("\n")}`);
if (outFile) writeFileSync(outFile, JSON.stringify(dump, null, 1));
