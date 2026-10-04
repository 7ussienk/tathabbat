import { normalizeArabic } from "@/lib/arabic/normalize";

/**
 * معجم الأحكام الثابت (القرار 54 / القاعدة 21). يُطبَّق على جملة الحكم المقتبسة حرفياً من نص الإمام،
 * لا على كلام النموذج. لا `authentic` آلياً أبداً من عبارة «صحيح الإسناد».
 *  موضوع/باطل → fabricated | لا أصل له/لم أقف عليه → no_basis_per_scholar | ضعيف/منكر/لا يصح → weak
 */
export type LexClass = "fabricated" | "no_basis_per_scholar" | "weak";

const NEGATORS = new Set(["ليس", "غير", "ما", "لا", "لم"]);

const TOKEN_RULES: [LexClass, RegExp][] = [
  ["fabricated", /^(ب|و|ف)?(موضوع|موضوعه|باطل|باطله)$/],
  ["weak", /^(ب|و|ف)?(ضعيف|ضعيفه|ضعفه|ضعف|منكر|منكره)$/],
];

const PHRASE_RULES: [LexClass, RegExp][] = [
  ["no_basis_per_scholar", /(^| )لا اصل (له|لها|لهذا)( |$)/],
  ["no_basis_per_scholar", /(^| )لم اقف (عليه|عليها|له علي اصل|له علي سند)( |$)/],
  ["weak", /(^| )لا يصح( |$)/],
];

export function classify(sentence: string): { found: LexClass[]; terms: string[] } {
  const n = normalizeArabic(sentence);
  const tokens = n.split(" ").filter(Boolean);
  const found = new Set<LexClass>();
  const terms: string[] = [];
  for (const [cls, re] of PHRASE_RULES) {
    const m = re.exec(n);
    if (m) {
      found.add(cls);
      terms.push(m[0].trim());
    }
  }
  tokens.forEach((t, i) => {
    for (const [cls, re] of TOKEN_RULES) {
      if (!re.test(t)) continue;
      const prev = tokens[i - 1];
      const negated = prev !== undefined && NEGATORS.has(prev.replace(/^(و|ف)(?=ليس|غير|ما|لا|لم)/, "")); // «ليس بضعيف»، «وليس بموضوع»، «غير موضوع»
      if (negated) continue;
      found.add(cls);
      terms.push(t);
    }
  });
  return { found: [...found], terms };
}

export type LexVerdict = "fabricated" | "no_basis_per_scholar" | "weak" | "disputed" | "scholar_text_only";

/** اتفاق الجملة والتصنيف المقترح ⇒ قبول؛ تعارض الألفاظ ⇒ disputed؛ لا لفظ في المعجم ⇒ scholar_text_only. */
export function decideVerdict(sentence: string, proposed: LexClass | "none"): { verdict: LexVerdict; found: LexClass[]; terms: string[] } {
  const { found, terms } = classify(sentence);
  if (found.length === 0) return { verdict: "scholar_text_only", found, terms };
  if (found.length > 1) return { verdict: "disputed", found, terms };
  const only = found[0];
  if (proposed === "none") return { verdict: "scholar_text_only", found, terms };
  if (proposed === only) return { verdict: only, found, terms };
  return { verdict: "disputed", found, terms };
}
