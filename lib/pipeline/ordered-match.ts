/**
 * المطابقة المرتّبة للفظ (قرار 4 أكتوبر، scoring-2026-10-04.2). سبب الخلل الذي أُصلح: `lexicalOverlap` كان يقارن «مجموعة»
 * كلمات بلا ترتيب ويحذف الكلمات الوظيفية ومنها «لا»، فيمرّ «انما النيات بالاعمال» و«يؤمن أحدكم…» (بحذف «لا») على أنهما مطابقان.
 *
 * هنا تُحفظ **كل** الكلمات (بعد التطبيع العربي فقط، بلا حذف للكلمات الوظيفية ولا إزالة للسوابق)، ويُشترط في «المطابقة التامة»:
 *  1) أن يرد الادعاء كاملاً **متتابعاً** في النص (ترتيب الكلمات نفسه)؛
 *  2) أن يبدأ عند بداية جملة وينتهي عند نهايتها (علامة ترقيم أو سطر جديد أو حدّ النص، أو بعد فعل القول «قال:»)، فلا يُقبل مقطع
 *     مبتور من وسط جملة (مثل حذف «لا» أو «إنما» من أولها)؛
 *  3) ألا تجاور الادعاءَ في النص أداةُ نفي أو استثناء (لا، لم، لن، ليس، ما، غير، بلا، إلا) لم تُذكر فيه؛
 *  4) أن يكون في **نافذة المتن** (ما بعد أول ذكر للنبي ﷺ) إن كان النص إسناداً ومتناً (الصحيحان)، لا في الإسناد.
 * غير التام يُصنَّف بالتطابق التقريبي LCS على الكلمات: near (LCS ≥ NEAR_LCS_MIN) ⟵ wording_differs، وإلا far ⟵ لا مطابقة.
 */
import { lightStem, normalizeArabic } from "@/lib/arabic/normalize";

export type Word = { w: string; start: number; bBefore: boolean; bAfter: boolean };
export type Parsed = { words: Word[]; matnFrom: number };

/** أدنى نسبة LCS لاعتبار النص «قريباً» (wording_differs). تبريرها على المراسي: انظر docs/PHASE1_RESULTS.md. */
export const NEAR_LCS_MIN = 0.6;
/** أو: نسبة كلمات الادعاء الموجودة في النص بلا ترتيب (إعادة ترتيب) — «انما النيات بالاعمال» كلماتها كلها في «إنما الأعمال بالنيات». */
export const NEAR_BAG_MIN = 0.8;

const NEGATION = new Set(["لا", "لم", "لن", "ليس", "ما", "غير", "بلا", "الا", "ولا", "ولم", "وما", "فلا", "فما"]);
const SPEECH = new Set(["قال", "قالت", "يقول", "تقول", "فقال", "وقال", "قلت", "فقالت", "وقالت", "قل", "قولوا", "يقولون", "حدث", "قالوا"]);
const TOKEN = /([\p{L}\p{N}\p{M}ـ]+)|(\s+)|([^\p{L}\p{N}\p{M}ـ\s]+)/gu;

/** يقسّم النص إلى كلمات مطبَّعة مع مواضعها وحدود الجمل، ويحدد بداية نافذة المتن (ما بعد أول ﷺ أو «النبي»/«رسول الله»). */
export function parseWords(text: string): Parsed {
  const words: Word[] = [];
  let boundary = true;
  let afterMarker = -1;
  let sawMarker = false;
  for (const m of text.matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      const n = normalizeArabic(m[1]);
      if (!n) {
        if (m[1].includes("FDFA") && afterMarker < 0) sawMarker = true; // ﷺ
        continue; // رموز الصلاة والترضي شفافة
      }
      if (words.length) words[words.length - 1].bAfter = boundary;
      words.push({ w: n, start: m.index!, bBefore: boundary, bAfter: false });
      boundary = false;
      if (sawMarker && afterMarker < 0) afterMarker = words.length - 1; // أول كلمة بعد ﷺ
    } else if (m[2] !== undefined) {
      if (m[2].includes("\n")) boundary = true;
    } else {
      boundary = true;
    }
  }
  if (words.length) words[words.length - 1].bAfter = true;
  // بداية المتن = الأبكر من: بعد أول ﷺ، وبعد أول «النبي»، وبعد أول «رسول الله»
  const cands: number[] = [];
  if (afterMarker >= 0) cands.push(afterMarker);
  for (let i = 0; i < words.length; i++) {
    if (words[i].w === "النبي") { cands.push(i + 1); break; }
  }
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i].w === "رسول" && words[i + 1].w === "الله") { cands.push(i + 2); break; }
  }
  const from = cands.length ? Math.min(...cands) : 0;
  return { words, matnFrom: from >= words.length ? 0 : from };
}

const INTRO = [["قال", "رسول", "الله"], ["قال", "النبي"], ["قال", "الرسول"], ["عن", "النبي"], ["عن", "رسول", "الله"]];

/** كلمات الادعاء المطبَّعة، مع حذف عبارة التقديم الاعتيادية في أوله («قال رسول الله ﷺ:»). */
export function claimWords(claim: string): string[] {
  const ws = parseWords(claim).words.map((x) => x.w);
  for (const intro of INTRO) if (intro.every((t, i) => ws[i] === t) && ws.length > intro.length) return ws.slice(intro.length);
  return ws;
}

/** تطابق كلمتين مع تسامح «و/ف» الملتصقة في **أول** كلمة من الادعاء فقط. */
const eq = (a: string, b: string, first: boolean) =>
  a === b || (first && ((a.startsWith("و") && a.slice(1) === b) || (b.startsWith("و") && b.slice(1) === a) || (a.startsWith("ف") && a.slice(1) === b)));

export function lcsLen(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/** أطول تتابع متصل مشترك (بالكلمات). */
export function longestRun(a: string[], b: string[]): number {
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0;
      if (cur[j] > best) best = cur[j];
    }
    prev = cur;
  }
  return best;
}

export type OrderedResult =
  | { kind: "exact"; at: number; end: number }
  | { kind: "near"; lcsCov: number; runCov: number; bagCov: number; why: string }
  | { kind: "far"; lcsCov: number; runCov: number; bagCov?: number };

/**
 * نسبة كلمات الادعاء الموجودة في النص كمجموعة متعددة (بلا ترتيب)، تحفظ كل الكلمات حتى «لا»، بعد إزالة السوابق (ال/بال/وال/لل)
 * لأن تبديل كلمتين يبدّل سوابقهما معهما («النيات بالأعمال» مقابل «الأعمال بالنيات»). **للتصنيف القريب فقط، ولا تصلح للمطابقة التامة.**
 */
export function bagCoverage(a0: string[], b0: string[]): number {
  if (!a0.length) return 0;
  const a = a0.map(lightStem);
  const b = b0.map(lightStem);
  const pool = new Map<string, number>();
  for (const w of b) pool.set(w, (pool.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of a) {
    const n = pool.get(w) ?? 0;
    if (n > 0) { hit++; pool.set(w, n - 1); }
  }
  return hit / a.length;
}

/** مطابقة ادعاء بنص واحد (مدخل أو صيغة). `matnOnly`: يُبحث في نافذة المتن بعد الإسناد (الصحيحان). */
export function orderedMatch(claim: string, text: string, opts: { matnOnly?: boolean } = {}): OrderedResult {
  const c = claimWords(claim);
  const parsed = parseWords(text);
  const from = opts.matnOnly ? parsed.matnFrom : 0;
  const E = parsed.words;
  const n = c.length;
  if (n === 0) return { kind: "far", lcsCov: 0, runCov: 0 };

  let why = "";
  for (let s = from; s + n <= E.length; s++) {
    let ok = true;
    for (let k = 0; k < n && ok; k++) ok = eq(c[k], E[s + k].w, k === 0);
    if (!ok) continue;
    const e = s + n - 1;
    const prev = E[s - 1]?.w;
    const next = E[e + 1]?.w;
    const startAligned = s === from || s === 0 || E[s].bBefore || (prev !== undefined && SPEECH.has(prev));
    const endAligned = e === E.length - 1 || E[e].bAfter;
    if (startAligned && endAligned && !(prev && NEGATION.has(prev) && !E[s].bBefore) && !(next && NEGATION.has(next) && !E[e].bAfter)) {
      return { kind: "exact", at: s, end: e };
    }
    why = !startAligned || (prev && NEGATION.has(prev)) ? "fragment_start" : "fragment_end";
  }
  const win = E.slice(from).map((x) => x.w);
  const lcsCov = lcsLen(c, win) / n;
  const runCov = longestRun(c, win) / n;
  const bagCov = bagCoverage(c, win);
  if (lcsCov >= NEAR_LCS_MIN || bagCov >= NEAR_BAG_MIN) return { kind: "near", lcsCov, runCov, bagCov, why: why || (lcsCov < NEAR_LCS_MIN ? "reordered" : "altered") };
  return { kind: "far", lcsCov, runCov, bagCov };
}

/** أفضل نتيجة بين عدة نصوص (صيغ منتقاة، ومدخل الكتاب، وأسماء الإحالة): exact يغلب near يغلب far. */
export function bestOrdered(claim: string, texts: string[], opts: { matnOnly?: boolean } = {}): OrderedResult {
  let best: OrderedResult = { kind: "far", lcsCov: 0, runCov: 0 };
  for (const t of texts) {
    const r = orderedMatch(claim, t, opts);
    if (r.kind === "exact") return r;
    const rank = (x: OrderedResult) => (x.kind === "near" ? 1 + x.lcsCov : x.kind === "far" ? x.lcsCov : 3);
    if (rank(r) > rank(best)) best = r;
  }
  return best;
}

/** موضع بداية المتن (فهرس الحرف) في نص، ليُطوى الإسناد في الواجهة. null إن لم يتميز إسناد. */
export function matnCharStart(text: string): number | null {
  const p = parseWords(text);
  if (p.matnFrom <= 0 || p.matnFrom >= p.words.length) return null;
  return p.words[p.matnFrom].start;
}
