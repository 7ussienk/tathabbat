import { normalizeArabic } from "@/lib/arabic/normalize";

/**
 * معجم الأحكام الثابت (القاعدة 21، القرار 54 وتعديلاته 4 أكتوبر). يُطبَّق على جملة الحكم المقتبسة حرفياً من نص
 * الإمام، لا على كلام النموذج. لا `authentic` آلياً أبداً. النسخة: lib/versions.ts. التفصيل: docs/LEXICON.md.
 *
 * الأصل (القرار 54):  موضوع/باطل → fabricated | لا أصل له/لم أقف عليه → no_basis_per_scholar | ضعيف/منكر/لا يصح → weak
 * تعديلات 4 أكتوبر:
 *  - عائلة «لا أصل» (باطل، موضوع، كذب، لا أصل له، لا أصل له بهذا اللفظ) اتفاقٌ لا تعارض، ويُختار أقوى لفظ
 *    (موضوع/باطل/كذب ⟵ fabricated، ثم لا أصل له ⟵ no_basis_per_scholar).
 *  - «ضعيف» لا يُدمج مع أي من العائلة ولا مع لفظ إيجابي (صحيح/حسن/ثابت): disputed.
 *  - «ليس من كلام النبي ﷺ» بلا قائل آخر ⟵ no_basis_per_scholar.
 *  - «لا يعرف مرفوعاً» و«يحكى عن» و«من قول» ⟵ misattributed فقط إن ورد اسم القائل بعدها (نمط اسم)، وإلا scholar_text_only.
 * كل ما أُضيف في التعديلات موسوم `needs_scholar_review` ويُسجَّل في نتيجة الادعاء (lexicon_review_terms).
 */
export type LexClass = "fabricated" | "no_basis_per_scholar" | "weak";
export type LexVerdict = "fabricated" | "no_basis_per_scholar" | "weak" | "misattributed" | "disputed" | "scholar_text_only";

export type LexResult = {
  verdict: LexVerdict;
  found: LexClass[];
  terms: string[];
  /** ألفاظ مطابَقة أُضيفت بتعديل 4 أكتوبر وتنتظر مراجعة المرشد */
  needs_scholar_review: string[];
  positive: boolean;
  misattributed_by: string | null;
};

const NEGATORS = new Set(["ليس", "غير", "ما", "لا", "لم", "لن", "بلا"]);
const stripConj = (t: string) => t.replace(/^(و|ف)(?=ليس|غير|ما|لا|لم|لن)/, "");

type Rule = { cls: LexClass; term: string; re: RegExp; review?: boolean };

const TOKEN_RULES: Rule[] = [
  // التأنيث («موضوعة» ⟵ «موضوعه» بعد التطبيع، «باطلة» ⟵ «باطله») مغطّى منذ .3. النصب المجرد («موضوعًا») لا يُضاف هنا: فحص 24492 جملة من «المقاصد» أظهر أنه يخطئ
  // (إنكار «ولا يلزم أن يكون موضوعًا»، ونص الحديث «كفى بالمرء كذبًا»)؛ فصيغة النصب الصريحة في PHRASE_RULES أدناه («بكونه موضوعًا/باطلًا») فقط (lexicon-2026-10-04.4)
  { cls: "fabricated", term: "موضوع", re: /^(ب|و|ف)?(موضوع|موضوعه)$/ },
  { cls: "fabricated", term: "باطل", re: /^(ب|و|ف)?(باطل|باطله)$/ },
  { cls: "fabricated", term: "كذب", re: /^(ب|و|ف)?كذب$/, review: true },
  { cls: "weak", term: "ضعيف", re: /^(ب|و|ف)?(ضعيف|ضعيفه|ضعفه|ضعف|منكر|منكره)$/ },
];

const PHRASE_RULES: Rule[] = [
  // lexicon-2026-10-04.4: واو العطف/الفاء قبل «لا أصل له» و«لم أقف عليه» («ولا أصل له في المرفوع»)
  { cls: "no_basis_per_scholar", term: "لا أصل له", re: /(^| )(?:و|ف)?لا اصل (له|لها|لهذا)( |$)/ },
  // «فلم أقف عليها إلا في موضعين» ليس نفياً للأصل: يُستثنى ما تلاه «إلا»
  { cls: "no_basis_per_scholar", term: "لم أقف عليه", re: /(^| )(?:و|ف)?لم اقف (عليه|عليها|له علي اصل|له علي سند)(?! الا)( |$)/ },
  // صيغة النصب بعد «بكونه/بكونها» فقط: «وممن جزم بكونه موضوعًا»
  { cls: "fabricated", term: "بكونه موضوعًا", re: /(^| )(?:و|ف)?بكونه?ا? (موضوعا|باطلا)( |$)/ },
  // قرار 4 أكتوبر (P3): «ما علمته/فما علمته» بمعنى «لم أقف عليه» (lexicon-2026-10-04.3)، وتنتظر مراجعة المرشد
  { cls: "no_basis_per_scholar", term: "ما علمته", re: /(^| )(?:و|ف)?ما علمته( |$)/, review: true },
  { cls: "weak", term: "لا يصح", re: /(^| )لا يصح( |$)/ },
];

/** ألفاظ إيجابية (needs_scholar_review): «صحيحه/صحيحها» اسم كتاب («في صحيحه») فلا تُعدّ. */
const POSITIVE_RE = /^(ب|و|ف)?(صحيح|صححه|صححها|صححوه|حسن|حسنه|حسنها|حسنوه|ثابت)$/;

const NOT_NABI = /(^| )ليس من كلام النبي( |$)/;
/** محفّزات النسبة لغير النبي ﷺ (needs_scholar_review): تُعدّ فقط إن تبعها اسم قائل. */
const MISATTR_TRIGGERS: { term: string; re: RegExp }[] = [
  { term: "لا يعرف مرفوعا", re: /(^| )(?:و|ف)?لا يعرف مرفوعا( |$)/ },
  { term: "يحكى عن", re: /(^| )(?:و|ف)?يحكي عن( |$)/ },
  { term: "من قول", re: /(^| )(?:و|ف)?من قول( |$)/ },
];

/** نمط اسم القائل: «فلان بن فلان»، «أبو/أبي/ابن/عبد فلان»، أو اسم مفرد شائع. */
const NAME_RE = /(?:^| )(?:(?:ابو|ابي|ابن|عبد)\s+\S+|\S+\s+بن\s+\S+|(?:علي|عمر|عثمان|معاذ|مالك|احمد|الشافعي|الحسن|سفيان|ابراهيم|عيسي|لقمان|يحيي)(?: |$))/;

function negatedWithin(tokens: string[], i: number, k: number): boolean {
  for (let j = Math.max(0, i - k); j < i; j++) if (NEGATORS.has(stripConj(tokens[j]))) return true;
  return false;
}

export function classify(sentence: string): Omit<LexResult, "verdict"> {
  const n = normalizeArabic(sentence);
  const tokens = n.split(" ").filter(Boolean);
  const found = new Set<LexClass>();
  const terms: string[] = [];
  const review: string[] = [];
  const addTerm = (cls: LexClass, term: string, flag?: boolean) => {
    found.add(cls);
    terms.push(term);
    if (flag) review.push(term);
  };

  for (const r of PHRASE_RULES) if (r.re.test(n)) addTerm(r.cls, r.term, r.review);
  tokens.forEach((t, i) => {
    for (const r of TOKEN_RULES) {
      if (!r.re.test(t)) continue;
      if (negatedWithin(tokens, i, 2)) continue; // «ليس بضعيف»، «غير موضوع»، «ولا ضعيف»
      addTerm(r.cls, r.term, r.review);
    }
  });

  let positive = false;
  tokens.forEach((t, i) => {
    if (POSITIVE_RE.test(t) && !negatedWithin(tokens, i, 4)) {
      positive = true;
      review.push(`إيجابي:${t}`);
    }
  });

  // النسبة لغير النبي ﷺ: لا بد من اسم قائل بعد المحفّز
  let misattributed_by: string | null = null;
  for (const trig of MISATTR_TRIGGERS) {
    const m = trig.re.exec(n);
    if (!m) continue;
    const rest = n.slice(m.index + m[0].length - (m[0].endsWith(" ") ? 1 : 0));
    const name = NAME_RE.exec(rest);
    if (name) {
      misattributed_by = name[0].trim();
      review.push(trig.term);
      break;
    }
  }
  return { found: [...found], terms, needs_scholar_review: [...new Set(review)], positive, misattributed_by };
}

/**
 * القرار: اتفاق الجملة والتصنيف المقترح ⇒ قبول؛ التعارض ⇒ disputed؛ لا لفظ ⇒ scholar_text_only.
 * (التصنيف المقترح من النموذج لا يغيّر ما قاله اللفظ؛ يمنع فقط الأخذ بجملة خالفها اقتراحه.)
 */
export function decideVerdict(sentence: string, proposed: LexClass | "none"): LexResult {
  const c = classify(sentence);
  const n = normalizeArabic(sentence);
  const hasF = c.found.includes("fabricated");
  const hasN = c.found.includes("no_basis_per_scholar");
  const hasW = c.found.includes("weak");
  const softNotNabi = NOT_NABI.test(n) && !c.misattributed_by; // «ليس من كلام النبي» بلا قائل آخر
  if (NOT_NABI.test(n) && !c.misattributed_by) c.needs_scholar_review.push("ليس من كلام النبي");
  const family = hasF || hasN || softNotNabi;
  const mis = !!c.misattributed_by && !hasF && !hasN;
  const make = (verdict: LexVerdict): LexResult => ({ ...c, needs_scholar_review: [...new Set(c.needs_scholar_review)], verdict });

  // «ضعيف» لا يُدمج مع العائلة ولا مع لفظ إيجابي ولا مع نسبة لغير النبي ﷺ: disputed
  if (hasW && (family || c.positive || mis)) return make("disputed");
  // لفظ إيجابي مع ألفاظ سلبية: disputed
  if (c.positive && (family || mis)) return make("disputed");

  if (hasW) {
    if (proposed === "weak") return make("weak");
    return make(proposed === "none" ? "scholar_text_only" : "disputed");
  }
  if (family) {
    if (proposed === "weak") return make("disputed"); // اقترح النموذج «ضعيفاً» والجملة من عائلة «لا أصل»
    if (proposed === "none" && (hasF || hasN)) return make("scholar_text_only");
    return make(hasF ? "fabricated" : "no_basis_per_scholar");
  }
  if (mis) return make(proposed === "weak" ? "disputed" : "misattributed");
  return make("scholar_text_only");
}
