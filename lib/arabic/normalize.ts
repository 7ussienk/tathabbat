/**
 * التطبيع العربي (CLAUDE.md §5 الخطوة 4): إزالة التشكيل والتطويل، توحيد الألف (أ إ آ ← ا)،
 * الياء (ى ← ي)، التاء المربوطة (ة ← ه)، وإزالة علامات الترقيم. تُحوَّل الأرقام الهندية إلى لاتينية
 * ويُطوى الفراغ. تُحذف رموز الصلاة والترضي (﷽ ﷺ ﵁ …) قبل أي تحويل حتى لا تتوسع إلى كلمات.
 *
 * `normalizeWithMap` يعيد كذلك خريطة من كل حرف مُطبَّع إلى موضعه في النص الأصلي، ليستخرج الكود
 * النص الحرفي من الأصل بعد المطابقة على المُطبَّع (القاعدة 21).
 */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/;
const HONORIFICS = /[﴾﴿﵀-﷿]/; // ﷺ ﷽ ﵁ ﵌ ...
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXT_INDIC = "۰۱۲۳۴۵۶۷۸۹";

function foldChar(ch: string): string {
  if (DIACRITICS.test(ch) || HONORIFICS.test(ch)) return "";
  if (ch === "أ" || ch === "إ" || ch === "آ" || ch === "ٱ") return "ا";
  if (ch === "ى") return "ي";
  if (ch === "ة") return "ه";
  let i = ARABIC_INDIC.indexOf(ch);
  if (i >= 0) return String(i);
  i = EXT_INDIC.indexOf(ch);
  if (i >= 0) return String(i);
  // الحروف المتصلة (Presentation Forms) تُحوَّل إلى الأصل
  const n = ch.normalize("NFKC");
  if (n !== ch) return [...n].map(foldChar).join("");
  if (/[\p{L}\p{N}]/u.test(ch)) return ch.toLowerCase();
  return " "; // علامات ترقيم ورموز وفراغات
}

export type Normalized = { text: string; map: number[] };

export function normalizeWithMap(input: string): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  let lastSpace = true; // يحذف الفراغ البادئ
  for (let i = 0; i < input.length; ) {
    const cp = input.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const folded = foldChar(ch);
    for (const c of folded) {
      if (c === " ") {
        if (lastSpace) continue;
        lastSpace = true;
      } else {
        lastSpace = false;
      }
      out.push(c);
      map.push(i);
    }
    i += ch.length;
  }
  if (out.length && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }
  return { text: out.join(""), map };
}

export function normalizeArabic(input: string): string {
  return normalizeWithMap(input).text;
}

/** هل النص `needle` (بعد التطبيع) substring من `haystack` (بعد التطبيع)؟ فارغ ⇒ false. */
export function containsNormalized(haystack: string, needle: string): boolean {
  const n = normalizeArabic(needle);
  return n.length > 0 && normalizeArabic(haystack).includes(n);
}

/**
 * يعيد المقطع الحرفي من `original` المقابل لـ `needle` بعد التطبيع، أو null إن لم يكن substring.
 * النص المعاد من الأصل بحروفه (بتشكيله وعلاماته) لا من النموذج.
 */
export function extractLiteral(original: string, needle: string): string | null {
  const n = normalizeArabic(needle);
  if (!n) return null;
  const { text, map } = normalizeWithMap(original);
  const at = text.indexOf(n);
  if (at < 0) return null;
  const start = map[at];
  const lastIdx = map[at + n.length - 1];
  // نهاية المقطع: آخر حرف مُطابِق وما يتبعه من تشكيل متصل به
  let end = lastIdx + 1;
  while (end < original.length && (DIACRITICS.test(original[end]) || HONORIFICS.test(original[end]))) end++;
  return original.slice(start, end);
}

/** إزالة سوابق شائعة لرفع الاسترجاع (ال، وال، بال، كال، فال، لل). تُطبَّق على الفهرس والاستعلام معاً. */
export function lightStem(term: string): string {
  if (term.length > 5 && /^(وال|بال|كال|فال)/.test(term)) return term.slice(3);
  if (term.length > 4 && term.startsWith("ال")) return term.slice(2);
  if (term.length > 4 && term.startsWith("لل")) return term.slice(1);
  return term;
}

/** كلمات وظيفية شائعة تُهمل في البحث (بعد التطبيع). */
export const STOPWORDS = new Set([
  "من", "في", "على", "عن", "الى", "ان", "انه", "انها", "ما", "لا", "هو", "هي", "هذا", "هذه", "ذلك", "قال", "ثم", "او", "كل",
  "الله", "رسول", "النبي", "عليه", "وسلم", "صلي", "حديث", "يا", "ايها", "قد", "لم", "بن", "عن", "به", "له", "فيه", "كان", "مع", "و",
]);

export function tokenize(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter(Boolean)
    .map(lightStem)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}
