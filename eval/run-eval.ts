/**
 * مشغّل التقييم الرسمي (CLAUDE.md §8). الاستخدام:
 *   npm run eval -- [--runs 3] [--conc 5] [--modes curated,nocurated] [--file eval/dataset.jsonl] [--validation private/validation_set.jsonl] [--out eval/report.md]
 *
 * - يشغّل الحالات النصية (الصوت والصور لاحقاً) عبر verifyMessage() نفسها، ثلاث مرات بتوازٍ 5، في نمطين: مع data/curated وبدونها.
 * - حالات التسرب (eval/leakage.jsonl): L003–L005 في النمطين، و L001/L002 (تحيلان إلى T008/T048) بدون curated فقط.
 * - بدون curated يُعرض **رقمان معاً دائماً**: (1) كل الادعاءات، (2) الممكنة على الكتب المفهرسة (= كل الادعاءات ناقص المعروفة
 *   التي لا مصدر لها في أي كتاب مفهرس فعلاً). لا يُعرض الثاني وحده.
 * - يُدقَّق كل مصدر في كل رد **مستقلاً عن validate**: وجود المدخل في الفهرس (أو الآية في المصحف) وكون النص substring حرفياً منه؛
 *   أي فشل = «اختلاق مصدر» (الهدف صفر).
 * - مجموعة التحقق المستقلة (--validation) تُقرأ كما وسمها صاحب المشروع ويُكتب تقريرها منفصلاً؛ لا يُضبط عليها شيء.
 * يكتب التقرير إلى eval/report.md ونتائج الحالات الخام إلى eval/results/ (خارج Git).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BudgetExceededError, CachingProvider } from "../lib/llm/cache";
import { GeminiProvider } from "../lib/llm/gemini";
import { LLMError, type LLMProvider } from "../lib/llm/provider";
import { containsNormalized } from "../lib/arabic/normalize";
import { getConfig } from "../lib/config";
import { lexicalOverlap } from "../lib/pipeline/retrieve";
import { verifyQuran } from "../lib/quran/quran";
import { getStore, type Store } from "../lib/retrieval/store";
import { POSITIVE_VERDICTS, type ClaimResult, type VerifyResponse } from "../lib/schemas/claim";
import { LEXICON_VERSION, PROMPT_VERSION, SCORING_VERSION } from "../lib/versions";
import { verifyMessage } from "../lib/verify-message";

process.loadEnvFile(".env");

type Expected = { claim_hint: string; accept: string[]; level: string; curated_ref?: string };
type Row = { id: string; category: string; input_type: string; input: string; expected: Expected[]; critical?: boolean; synthetic?: boolean; leakage?: boolean; ref_case?: string };
type Mode = "curated" | "nocurated";

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(opt("--runs") ?? 3);
const CONC = Number(opt("--conc") ?? 5);
const MODES = (opt("--modes") ?? "curated,nocurated").split(",") as Mode[];
const DATASET = opt("--file") ?? "eval/dataset.jsonl";
const VALIDATION = opt("--validation");
const OUT = opt("--out") ?? "eval/report.md";
const LIMIT = Number(opt("--limit") ?? 10_000);
const ONLY = opt("--only") ? new Set(opt("--only")!.split(",")) : null;

const readJsonl = <T>(p: string): T[] => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
const dataset = readJsonl<Row>(DATASET).filter((r) => r.input_type === "text").slice(0, LIMIT);
const leakage = readJsonl<Row>("eval/leakage.jsonl");
/** حالات تعديل اللفظ والضوابط (scripts/gen-wording-cases.ts): حرجة ومصطنعة، في النمطين؛ لا authentic للفظ معدَّل أبداً. */
const wording = existsSync("eval/wording_altered.jsonl") ? readJsonl<Row>("eval/wording_altered.jsonl") : [];

/** حالات التسرب حسب النمط: مع curated الثلاث الجديدة فقط؛ بدونها الخمس (L001/L002 تأخذ نص T008/T048 ويُتوقع فيهما الامتناع). */
function rowsFor(mode: Mode): Row[] {
  const extra: Row[] = [];
  for (const r of leakage) {
    if (r.ref_case) {
      if (mode !== "nocurated") continue;
      const base = dataset.find((d) => d.id === r.ref_case) ?? readJsonl<Row>("eval/dataset.jsonl").find((d) => d.id === r.ref_case)!;
      extra.push({ ...base, id: r.id, category: "leakage", critical: true, leakage: true, expected: base.expected.map((e) => ({ claim_hint: e.claim_hint, accept: ["not_found_in_sources"], level: e.level })) });
    } else extra.push({ ...r, category: "leakage", leakage: true });
  }
  const all = [...dataset, ...extra, ...wording];
  // تشغيل مستهدف (قاعدة الميزانية 3): --only critical,hadith_wording_altered,... (الكلمة critical تعني كل الحالات الحرجة)
  return ONLY ? all.filter((r) => ONLY.has(r.category) || (ONLY.has("critical") && r.critical)) : all;
}

const store: Store = await getStore();

const hasIndexedSource = (ref?: string) => {
  const c = ref ? store.curated.get(ref) : undefined;
  return !!c && c.sources.some((s) => store.indexedSources.includes(s.source_id));
};

function match(e: Expected, claims: ClaimResult[]): ClaimResult | undefined {
  // الحالات المضادة (قبول not_found_in_sources أو not_a_religious_claim): أيٌّ منهما مقبول، فلا يُفوَّت الأول بسبب الاستثناء أدناه. محصور بها لئلا تتساهل بقية الفئات.
  if (e.accept.length > 1 && e.accept.every((a) => a === "not_found_in_sources" || a === "not_a_religious_claim")) {
    const hit = claims.find((c) => e.accept.includes(c.verdict));
    if (hit) return hit;
  }
  if (e.accept.includes("refer_to_scholar")) return claims.find((c) => c.verdict === "refer_to_scholar");
  if (e.accept.includes("not_a_religious_claim")) return claims.find((c) => c.verdict === "not_a_religious_claim");
  return [...claims].sort((a, b) => lexicalOverlap(e.claim_hint, b.claim_text) - lexicalOverlap(e.claim_hint, a.claim_text))[0];
}

/** تدقيق مصادر ادعاء مستقل عن validate: المصدر موجود، والنص substring حرفي (بعد التطبيع) من المخزَّن. يعيد عدد الانتهاكات. */
function auditSources(c: ClaimResult): number {
  let bad = 0;
  for (const s of c.sources) {
    if (!s.quoted_text.trim()) { bad++; continue; }
    if (s.source_id === "quran-hafs") { if (verifyQuran(s.quoted_text).kind !== "verified") bad++; continue; }
    const n = /رقم (\d+)/.exec(s.location)?.[1];
    const entry = n ? [...[0, 1, 2].map((k) => store.entries.get(`${s.source_id}#${n}${k ? `-${k + 1}` : ""}`))].find(Boolean) : undefined;
    if (entry) {
      if (!containsNormalized(entry.text, s.quoted_text)) bad++;
      if (s.grading_quote && !containsNormalized(entry.text, s.grading_quote)) bad++;
    } else {
      // كتاب غير مفهرس: لا يصح إلا من سجل منتقى يحمل النص نفسه
      const ok = [...store.curated.values()].some((cur) => cur.sources.some((x) => x.source_id === s.source_id && x.location === s.location && [x.quoted_text, x.grading_quote].some((t) => t && (containsNormalized(t, s.quoted_text) || containsNormalized(s.quoted_text, t)))));
      if (!ok) bad++;
    }
  }
  return bad;
}

type Rec = {
  mode: Mode; run: number; id: string; category: string; critical: boolean; synthetic: boolean; leakage: boolean; known: boolean;
  accept: string[]; verdict: string; ok: boolean; abstain: boolean; outOfIndex: boolean; positive: boolean; sourced: boolean;
  badSources: number; downgraded: boolean; conf: number | null; ms: number; tokensIn: number; tokensOut: number; cost: number;
  fallback: number; llmCalls: number; llmFailed: number; status: string; served: string;
};

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const recs: Rec[] = [];
const runStats: { mode: Mode; run: number; ms: number }[] = [];
const cfg = getConfig();

// ---------- قواعد الميزانية (CLAUDE.md §13) ----------
// كاش لنداءات النموذج + حد EVAL_MAX_USD (الافتراضي 0.5$) + رفض إعادة تقييم commit وإعدادات سبق تقييمهما (إلا بـ --force)
const MAX_USD = Number(process.env.EVAL_MAX_USD ?? 0.5);
const gitOut = (a: string[]) => {
  try {
    return execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
};
const fileHash = (p: string) => (existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : "-");
const fingerprint = createHash("sha256")
  .update(
    [
      gitOut(["rev-parse", "HEAD"]),
      gitOut(["diff", "HEAD"]),
      gitOut(["ls-files", "--others", "--exclude-standard", "lib", "scripts", "eval", "data/curated"]),
      LEXICON_VERSION,
      PROMPT_VERSION,
      SCORING_VERSION,
      cfg.GEMINI_MODEL,
      DATASET,
      fileHash(DATASET),
      fileHash("eval/leakage.jsonl"),
      fileHash("eval/wording_altered.jsonl"),
      MODES.join(","),
      String(RUNS),
      String(VALIDATION ?? ""),
      String(opt("--only") ?? ""),
    ].join("\u0000"),
  )
  .digest("hex")
  .slice(0, 16);
const REGISTRY = "eval/results/evaluated.json";
mkdirSync("eval/results", { recursive: true });
const registry: Record<string, { at: string; commit: string; usd: number }> = existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, "utf8")) : {};
// --replay: يعيد حساب التقرير من الكاش فقط بلا أي نداء (النداء غير المخزَّن ⟵ llm_unavailable)، فلا يخضع لرفض البصمة ولا يُسجَّل في COST_LOG
const REPLAY = args.includes("--replay");
if (!REPLAY && registry[fingerprint] && !args.includes("--force")) {
  const p = registry[fingerprint];
  console.error(`رُفض التشغيل: هذا الـcommit والإعدادات سبق تقييمهما (${p.at}، ${p.commit}، ${p.usd}$). لا إعادة إلا بطلب صريح: --force`);
  process.exit(4);
}
let RUN_ID = "";
const replayInner: LLMProvider = { generateJson: async () => { throw new LLMError("replay: لا نتيجة مخزَّنة لهذا النداء", "unavailable"); } };
const cached = new CachingProvider(
  REPLAY ? replayInner : new GeminiProvider({
    apiKey: cfg.GEMINI_API_KEY!,
    model: cfg.GEMINI_MODEL,
    fallbackModel: cfg.GEMINI_FALLBACK_MODEL,
    firstTimeoutMs: cfg.LLM_FIRST_TIMEOUT_MS,
    fallbackTimeoutMs: cfg.LLM_FALLBACK_TIMEOUT_MS,
  }),
  {
    dir: "eval/cache",
    salt: [cfg.GEMINI_MODEL, cfg.GEMINI_FALLBACK_MODEL, PROMPT_VERSION, LEXICON_VERSION].join("|"),
    maxUsd: MAX_USD,
    priceInPerM: cfg.PRICE_IN_PER_M,
    priceOutPerM: cfg.PRICE_OUT_PER_M,
    getRun: () => RUN_ID,
  },
);
/** يسجّل ما صُرف فعلاً في docs/COST_LOG.md (قاعدة الميزانية 1) */
const logCost = (note: string) => {
  if (REPLAY) return;
  const when = new Date().toISOString().slice(0, 16).replace("T", " ");
  const commit = gitOut(["rev-parse", "--short", "HEAD"]).trim();
  const row = `| ${when} UTC | npm run eval (${MODES.join("+")} x${RUNS}) | ${commit} / ${fingerprint} | ${cached.stats.spentUsd.toFixed(3)}$ | ${note}؛ كاش: ${cached.stats.hits} إصابة / ${cached.stats.misses} نداء فعلي |\n`;
  try {
    appendFileSync("docs/COST_LOG.md", row);
  } catch {
    /* السجل اختياري */
  }
};

async function runMode(mode: Mode, run: number, rows: Row[]) {
  RUN_ID = `${mode}:${run}`;
  const t0 = Date.now();
  const res = await pool(rows, CONC, async (r) => {
    const t = Date.now();
    const out: VerifyResponse = await verifyMessage({ type: "text", text: r.input }, { llm: cached, route: `eval:${mode}:${run}`, useCurated: mode === "curated" });
    return { r, out, wall: Date.now() - t };
  });
  for (const { r, out, wall } of res) {
    const trace = out.llm_trace ?? [];
    for (const e of r.expected) {
      const c = match(e, out.claims);
      const verdict = c?.verdict ?? `(${out.status}:${out.error?.code ?? "no-claim"})`;
      const ok = !!c && e.accept.includes(c.verdict);
      const known = !!e.curated_ref;
      const abstain = !ok && verdict === "not_found_in_sources" && known && !r.leakage;
      const retrievalCase = known && !e.accept.includes("quran_verified") && !e.accept.includes("quran_misquoted") && !e.accept.includes("refer_to_scholar");
      recs.push({
        mode, run, id: r.id, category: r.category, critical: !!r.critical, synthetic: !!r.synthetic, leakage: !!r.leakage, known,
        accept: e.accept, verdict, ok, abstain, outOfIndex: retrievalCase && !hasIndexedSource(e.curated_ref),
        positive: !!c && POSITIVE_VERDICTS.includes(c.verdict), sourced: !!c && c.sources.length > 0 && c.sources.every((s) => s.quoted_text.trim().length > 0),
        badSources: c ? auditSources(c) : 0, downgraded: !!c?.downgrade_reason?.startsWith("validation_failed"), conf: c?.confidence ?? null,
        ms: out.timings_ms.total ?? wall, tokensIn: out.usage?.input_tokens ?? 0, tokensOut: out.usage?.output_tokens ?? 0, cost: out.usage?.cost_usd ?? 0,
        fallback: trace.filter((t2) => t2.attempts.length > 1).length, llmCalls: trace.length, llmFailed: trace.filter((t2) => !t2.attempts.some((a) => a.outcome === "ok")).length,
        status: out.status,
        served: (out.served_models ?? []).join("+") || "-",
      });
    }
  }
  runStats.push({ mode, run, ms: Date.now() - t0 });
  console.log(`  ${mode} تشغيل ${run}: ${rows.length} رسالة في ${((Date.now() - t0) / 1000).toFixed(0)}ث`);
}

console.log(`eval: ${RUNS} تشغيلات × ${MODES.join("+")}، توازٍ ${CONC}، نموذج ${cfg.GEMINI_MODEL} (احتياطي ${cfg.GEMINI_FALLBACK_MODEL})`);
console.log(`ميزانية: EVAL_MAX_USD=${MAX_USD}$ | بصمة التشغيل ${fingerprint} | كاش: eval/cache`);
try {
  for (const mode of MODES) for (let run = 1; run <= RUNS; run++) await runMode(mode, run, rowsFor(mode));
} catch (e) {
  if (e instanceof BudgetExceededError) {
    console.error(`\nأُوقف التشغيل: ${e.message}. ما أُنجز محفوظ في الكاش: أعد التشغيل بحد أعلى فيُكمل من حيث توقف بلا إعادة نداءات.`);
    logCost("أُوقف بحد EVAL_MAX_USD");
    process.exit(3);
  }
  throw e;
}
if (!REPLAY && !VALIDATION) registry[fingerprint] = { at: new Date().toISOString(), commit: gitOut(["rev-parse", "--short", "HEAD"]).trim(), usd: Math.round(cached.stats.spentUsd * 1000) / 1000 };
if (!REPLAY && !VALIDATION) writeFileSync(REGISTRY, JSON.stringify(registry, null, 1));
if (!VALIDATION) logCost("اكتمل");
console.log(`\nالمصروف فعلاً: ${cached.stats.spentUsd.toFixed(3)}$ | كاش: ${cached.stats.hits} إصابة / ${cached.stats.misses} نداء فعلي`);

// ---------- التقرير ----------
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;
const commit = (() => { try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "?"; } })();
const L: string[] = [];
L.push("# تقرير التقييم", "");
L.push(`> **غير نهائي**: ${VALIDATION ? "تقرير مجموعة التحقق المستقلة: تشغيل واحد، ولا يُضبط عليها شيء." : "مجموعة التحقق المستقلة لم تُشغَّل بعد، فلا تُقرأ الأرقام أدناه دقةً نهائية للتسليم."}`, "");
L.push(`- التاريخ: ${new Date().toISOString()} | commit: \`${commit}\` | المعجم: \`${LEXICON_VERSION}\` | البرومتات: \`${PROMPT_VERSION}\` | التسجيل: \`${SCORING_VERSION}\``);
L.push(`- النموذج: \`${cfg.GEMINI_MODEL}\` (احتياطي \`${cfg.GEMINI_FALLBACK_MODEL}\`) | ${RUNS} تشغيلات، توازٍ ${CONC} | عتبة الثقة ${cfg.CONFIDENCE_THRESHOLD}`);
L.push(`- الكتب المفهرسة: ${store.indexedSources.join("، ")} (+ ${store.curated.size} مدخل منتقى في نمط «مع curated»)`, "");

function section(mode: Mode) {
  const rs = recs.filter((r) => r.mode === mode);
  const name = mode === "curated" ? "مع data/curated" : "بدون data/curated";
  L.push(`## ${name}`, "");
  const runs = [...new Set(rs.map((r) => r.run))];
  const per = (f: (x: Rec[]) => string) => runs.map((n) => f(rs.filter((r) => r.run === n))).join(" / ");
  const unrel = (x: Rec[]) => x.filter((r) => r.outOfIndex);
  L.push(`### الدقة (كل تشغيل على حدة: ${runs.map((n) => `#${n}`).join(" / ")})`);
  L.push(`1. **كل الادعاءات:** ${per((x) => `${x.filter((r) => r.ok).length}/${x.length} (${pct(x.filter((r) => r.ok).length, x.length)})`)}`);
  if (mode === "nocurated") {
    L.push(`2. **الممكنة على الكتب المفهرسة:** ${per((x) => { const d = x.filter((r) => !r.outOfIndex); return `${d.filter((r) => r.ok).length}/${d.length} (${pct(d.filter((r) => r.ok).length, d.length)})`; })}`);
    const first = rs.filter((r) => r.run === runs[0]);
    L.push(`   - المقام (2) = كل الادعاءات (${first.length}) ناقص ${unrel(first).length} ادعاءً معروفاً (له curated_ref) لا مصدر له في أي كتاب مفهرس فعلاً. **الرقمان يُقرآن معاً.**`);
  }
  L.push("");
  const cats = [...new Set(rs.map((r) => r.category))].sort();
  L.push("| الفئة | إصابات | امتناع على معروف | الحد | تقييم |", "|---|---|---|---|---|");
  for (const c of cats) {
    const x = rs.filter((r) => r.category === c && r.run === runs[0]);
    const crit = x.some((r) => r.critical);
    const thr = crit ? 1 : c.includes("voice") ? 0.85 : 0.9;
    const hit = x.filter((r) => r.ok).length;
    L.push(`| ${c} | ${hit}/${x.length} (${pct(hit, x.length)}) | ${x.filter((r) => r.abstain).length} | ${thr * 100}% | ${hit / x.length >= thr ? "✓" : "✗"} |`);
  }
  L.push("");
  const crit = (x: Rec[]) => x.filter((r) => r.critical);
  L.push(`**الحالات الحرجة:** ${per((x) => `${crit(x).filter((r) => r.ok).length}/${crit(x).length} إصابة، ${crit(x).filter((r) => r.abstain).length} امتناع، ${crit(x).filter((r) => !r.ok && !r.abstain).length} إخفاق`)}`, "");
  const lk = rs.filter((r) => r.leakage);
  L.push(`**حالات التسرب** (المتوقع not_found_in_sources): ${per((x) => { const l = x.filter((r) => r.leakage); return `${l.filter((r) => r.ok).length}/${l.length}`; })}${lk.some((r) => !r.ok) ? " — ✗ تسرّب: " + [...new Set(lk.filter((r) => !r.ok).map((r) => `${r.id}→${r.verdict}`))].join("، ") : ""}`, "");
  const pos = rs.filter((r) => r.positive);
  L.push(`**الإسناد** (الأحكام الإيجابية فقط، القاعدة 11): ${per((x) => { const p = x.filter((r) => r.positive); return `${p.filter((r) => r.sourced).length}/${p.length} (${pct(p.filter((r) => r.sourced).length, p.length)})`; })}`);
  L.push(`**تدقيق المصادر المستقل (اختلاق مصدر؛ الهدف 0):** ${per((x) => String(x.reduce((a, r) => a + r.badSources, 0)))} | **أحكام خُفِّضت لفشل التحقق:** ${per((x) => String(x.filter((r) => r.downgraded).length))}`);
  const altered = rs.filter((r) => r.category === "hadith_wording_altered");
  L.push(`**authentic على لفظ معدَّل (خطأ حرج؛ الهدف 0):** ${per((x) => String(x.filter((r) => r.category === "hadith_wording_altered" && r.verdict === "authentic").length))} من ${altered.length / runs.length} حالة معدَّلة`);
  const synthWrong = rs.filter((r) => r.synthetic && r.verdict === "no_basis_per_scholar");
  L.push(`**مصطنعة نُسب لها حكم منقول (خطأ حرج):** ${synthWrong.length}`, "");
  // الثبات
  const byKey = new Map<string, Rec[]>();
  rs.forEach((r) => byKey.set(`${r.id}|${r.accept.join(",")}`, [...(byKey.get(`${r.id}|${r.accept.join(",")}`) ?? []), r]));
  const stable = [...byKey.values()].filter((v) => new Set(v.map((r) => r.verdict)).size === 1).length;
  L.push(`**الثبات بين التشغيلات:** ${stable}/${byKey.size} (${pct(stable, byKey.size)}) ادعاءً بحكم واحد في كل التشغيلات`, "");
  // الزمن والتكلفة
  const ms = rs.map((r) => r.ms);
  const cost = rs.reduce((a, r) => a + r.cost, 0);
  L.push(`**الزمن للرسالة:** وسيط ${q(ms, 50)}ms | p95 ${q(ms, 95)}ms | أقصى ${Math.max(...ms)}ms (الهدف < 30000ms) | تشغيلات: ${runStats.filter((s) => s.mode === mode).map((s) => `${(s.ms / 1000).toFixed(0)}ث`).join(" / ")}`);
  L.push(`**نداءات النموذج:** ${rs.reduce((a, r) => a + r.llmCalls, 0)} | احتاجت الاحتياطي: ${rs.reduce((a, r) => a + r.fallback, 0)} | فشلت كلياً: ${rs.reduce((a, r) => a + r.llmFailed, 0)} | رسائل بحالة غير ok: ${rs.filter((r) => r.status !== "ok").length}`);
  if (mode === MODES[MODES.length - 1]) L.push(`**المصروف فعلاً (بعد الكاش):** $${cached.stats.spentUsd.toFixed(3)} | إصابات الكاش ${cached.stats.hits}، نداءات فعلية ${cached.stats.misses} (الأرقام التالية تكلفة مكافئة بلا كاش)`);
  L.push(`**التكلفة:** $${cost.toFixed(3)} لـ${rs.length} ادعاءً في ${runs.length} تشغيلات (≈ $${(cost / (rs.length / runs.length) / runs.length).toFixed(4)} للادعاء)`, "");
  // النموذج الذي خدم كل حالة (التشغيل الأول): "cache" = نتيجة مخزَّنة قديمة بلا نموذج مسجَّل، و"-" = لم يكتمل نداء
  const servedBy = new Map<string, string[]>();
  for (const r of rs.filter((x) => x.run === runs[0])) servedBy.set(r.served, [...(servedBy.get(r.served) ?? []), r.id]);
  L.push("**النموذج الذي خدم كل حالة (التشغيل الأول):**");
  for (const [k, ids] of [...servedBy].sort()) L.push(`- ${k}: ${ids.length} حالة — ${ids.join("، ")}`);
  L.push("");
  const bad = [...byKey.values()].filter((v) => v.some((r) => !r.ok));
  if (bad.length) {
    L.push("### غير المصاب في تشغيل واحد على الأقل", "");
    for (const v of bad) {
      const r0 = v[0];
      L.push(`- ${r0.id}${r0.critical ? "*" : ""} [${r0.category}] متوقع ${r0.accept.join("/")} ← ${v.map((r) => r.verdict + (r.abstain ? " (امتناع)" : r.outOfIndex ? " (كتاب غير مفهرس)" : "")).join(" ، ")}  [خدمه: ${[...new Set(v.map((r) => r.served))].join(" ، ")}]`);
    }
    L.push("");
  }
}
for (const m of MODES) section(m);

mkdirSync("eval/results", { recursive: true });
writeFileSync(`eval/results/run-${Date.now()}.json`, JSON.stringify({ versions: { lexicon: LEXICON_VERSION, prompts: PROMPT_VERSION, scoring: SCORING_VERSION }, commit, recs }, null, 0));

// ---------- مجموعة التحقق المستقلة (منفصلة) ----------
if (VALIDATION) {
  const vrows = readJsonl<Row>(VALIDATION).filter((r) => r.expected[0]?.accept?.length);
  L.push("## مجموعة التحقق المستقلة (توسيم صاحب المشروع، لا يُضبط عليها شيء)", "");
  if (!vrows.length) L.push("لم تُوسَم بعد (accept فارغ في كل الحالات).");
  else {
    const vr: Rec[] = [];
    for (let run = 1; run <= RUNS; run++) {
      const res = await pool(vrows, CONC, async (r) => ({ r, out: await verifyMessage({ type: "text", text: r.input }, { llm: cached, route: "eval:validation", useCurated: false }) }));
      for (const { r, out } of res) {
        const c = out.claims[0];
        vr.push({ mode: "nocurated", run, id: r.id, category: r.category, critical: false, synthetic: false, leakage: false, known: false, accept: r.expected[0].accept, verdict: c?.verdict ?? "(none)", ok: !!c && r.expected[0].accept.includes(c.verdict), abstain: false, outOfIndex: false, positive: !!c && POSITIVE_VERDICTS.includes(c.verdict), sourced: !!c && c.sources.length > 0, badSources: c ? auditSources(c) : 0, downgraded: false, conf: c?.confidence ?? null, ms: out.timings_ms.total ?? 0, tokensIn: 0, tokensOut: 0, cost: out.usage?.cost_usd ?? 0, fallback: 0, llmCalls: 0, llmFailed: 0, status: out.status, served: (out.served_models ?? []).join("+") || "-" });
      }
    }
    const runs = [...new Set(vr.map((r) => r.run))];
    L.push(`النسخ المجمَّدة: المعجم \`${LEXICON_VERSION}\`، البرومتات \`${PROMPT_VERSION}\`. ${vrows.length} حالة.`);
    L.push(`**الإصابة:** ${runs.map((n) => { const x = vr.filter((r) => r.run === n); return `${x.filter((r) => r.ok).length}/${x.length} (${pct(x.filter((r) => r.ok).length, x.length)})`; }).join(" / ")} | اختلاق مصدر: ${vr.reduce((a, r) => a + r.badSources, 0)}`, "");
    L.push("| الحالة | المتوقع | الفعلي (التشغيلات) | النموذج الذي خدم |", "|---|---|---|---|");
    for (const r of vrows) L.push(`| ${r.id} | ${r.expected[0].accept.join("/")} | ${vr.filter((x) => x.id === r.id).map((x) => x.verdict).join(" ، ")} | ${vr.filter((x) => x.id === r.id).map((x) => x.served).join(" ، ")} |`);
  }
}
if (VALIDATION) {
  // مجموعة التحقق تُشغَّل بعد ملخص الميزانية أعلاه، فتُسجَّل تكلفتها هنا (بعد اكتمالها)
  if (!REPLAY) {
    registry[fingerprint] = { at: new Date().toISOString(), commit: gitOut(["rev-parse", "--short", "HEAD"]).trim(), usd: Math.round(cached.stats.spentUsd * 1000) / 1000 };
    writeFileSync(REGISTRY, JSON.stringify(registry, null, 1));
    logCost("اكتمل مع مجموعة التحقق");
  }
  console.log(`المصروف الكلي بعد مجموعة التحقق: ${cached.stats.spentUsd.toFixed(3)}$ | كاش: ${cached.stats.hits} إصابة / ${cached.stats.misses} نداء فعلي`);
}
writeFileSync(OUT, L.join("\n") + "\n");
console.log(`\nكُتب ${OUT}`);
