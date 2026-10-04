/**
 * ربط مداخل الإحالة بأهدافها (قرار 4 أكتوبر، البند ج). في «المقاصد الحسنة» نحو 11% من المداخل مجرد إحالة:
 *   «٦ - حديث: أبخل الناس، في: إن أبخل.»  ← الحكم في مدخل آخر مطلعه «إن أبخل…»
 * يربط الكود الإحالة بهدفها وقت البناء (بلا نموذج)، فيُسترجع الهدف بصيغة الإحالة أيضاً، ويُعرض نص الهدف حرفياً
 * مع ذكر المدخلين (رقم الإحالة ورقم الهدف). الربط يتم فقط إن طابق مطلع مدخل واحد لا غير؛ الغامض يُترك دون ربط.
 */
import { normalizeArabic } from "@/lib/arabic/normalize";
import type { BookEntry } from "@/lib/retrieval/chunk-maqasid";

export const STUB_MAX_CHARS = 170;
const STUB_RE = /^حديث\s*:\s*(.+?)،\s*(?:في|فى)\s*:?\s*([^،.]{3,80})\.?\s*$/s;

export type StubLink = { stub: number; target: number; stubText: string; alias: string; phrase: string };
export type StubStats = { stubs: number; linked: number; ambiguous: number; unresolved: number };

const headWords = (text: string, n = 14) => normalizeArabic(text.replace(/^حديث\s*:\s*/, "")).split(" ").slice(0, n);

/** يعيد المداخل نفسها مع حقول ref_to/see_also مضافة، ومعها الإحصاءات (لا يغيّر النص). */
export function linkStubs(entries: BookEntry[]): { entries: BookEntry[]; links: StubLink[]; stats: StubStats } {
  const heads = entries.map((e) => ({ n: e.number, words: headWords(e.text), isStub: false }));
  const stubInfo = new Map<number, { alias: string; phrase: string }>();
  for (const e of entries) {
    if (e.text.length >= STUB_MAX_CHARS) continue;
    const m = STUB_RE.exec(e.text.trim());
    if (!m) continue;
    stubInfo.set(e.number, { alias: m[1].trim(), phrase: normalizeArabic(m[2]) });
  }
  heads.forEach((h) => (h.isStub = stubInfo.has(h.n)));

  const links: StubLink[] = [];
  const stats: StubStats = { stubs: stubInfo.size, linked: 0, ambiguous: 0, unresolved: 0 };
  const byNumber = new Map<number, BookEntry>(entries.map((e) => [e.number, { ...e }]));
  for (const [num, info] of stubInfo) {
    const pw = info.phrase.split(" ").filter(Boolean);
    if (pw.join("").length < 3) {
      stats.unresolved++;
      continue;
    }
    // الهدف: مدخل (غير إحالة) يبدأ مطلعه بعبارة الإحالة نفسها
    const matches = heads.filter((h) => h.n !== num && !h.isStub && pw.every((w, i) => h.words[i] === w));
    if (matches.length === 0) stats.unresolved++;
    else if (matches.length > 1) stats.ambiguous++;
    else {
      const t = matches[0].n;
      const stub = byNumber.get(num)!;
      const target = byNumber.get(t)!;
      stub.ref_to = t;
      target.see_also = [...(target.see_also ?? []), { number: num, text: stub.text, alias: info.alias }];
      links.push({ stub: num, target: t, stubText: stub.text, alias: info.alias, phrase: info.phrase });
      stats.linked++;
    }
  }
  return { entries: entries.map((e) => byNumber.get(e.number)!), links, stats };
}
