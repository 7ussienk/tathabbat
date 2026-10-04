/**
 * التحقق من الآيات برمجياً من الملف المحلي data/quran/quran-uthmani.txt (Tanzil؛ لا يُعدَّل، ولا شبكة).
 * المقارنة على «الهيكل العظمي» للحروف: تطبيع عربي + حذف الألف والهمزة (فرق الإملاء العثماني/الإملائي)
 * + تحويل «واو + ألف خنجرية» إلى ألف (الصلوٰة ← الصلاة). النص المعروض حرفي من الملف لا من المُدخل.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeArabic } from "@/lib/arabic/normalize";

export type Ayah = { sura: number; aya: number; text: string };

export type QuranMatch =
  | { kind: "verified"; location: string; text: string; distance: 0 }
  | { kind: "misquoted"; location: string; text: string; distance: number }
  | { kind: "none" };

export const QURAN_SOURCE_ID = "quran-hafs";
const BASMALA = /^بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَٰنِ\s+ٱلرَّحِيمِ\s*/;
const MIN_WORDS = 3;
const MIN_WORDS_MISQUOTE = 4;

export function skeletonWords(s: string): string[] {
  const pre = s.replace(/وٰ/g, "ا");
  return normalizeArabic(pre)
    .replace(/[اء]/g, "")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .split(" ")
    .filter(Boolean);
}

type Sura = { n: number; words: string[]; ayaOfWord: number[]; joined: string; ayat: Ayah[] };
let cache: Sura[] | null = null;

export function parseQuran(raw: string): Ayah[] {
  const out: Ayah[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    if (!m) continue;
    const sura = Number(m[1]);
    const aya = Number(m[2]);
    let text = m[3].trim();
    if (aya === 1 && sura !== 1 && sura !== 9) text = text.replace(BASMALA, "").trim() || text;
    out.push({ sura, aya, text });
  }
  return out;
}

export function loadSuras(raw?: string): Sura[] {
  if (cache && raw === undefined) return cache;
  const text = raw ?? readFileSync(path.join(process.cwd(), "data", "quran", "quran-uthmani.txt"), "utf8");
  const ayat = parseQuran(text);
  if (ayat.length !== 6236) throw new Error(`ملف القرآن غير سليم: ${ayat.length} آية والمتوقع 6236`);
  const by = new Map<number, Ayah[]>();
  for (const a of ayat) by.set(a.sura, [...(by.get(a.sura) ?? []), a]);
  const suras: Sura[] = [...by.entries()].map(([n, list]) => {
    const words: string[] = [];
    const ayaOfWord: number[] = [];
    for (const a of list) for (const w of skeletonWords(a.text)) (words.push(w), ayaOfWord.push(a.aya));
    return { n, words, ayaOfWord, joined: words.join(" "), ayat: list };
  });
  if (raw === undefined) cache = suras;
  return suras;
}

const PREFIX = /^\s*(?:قال\s+(?:الله\s+)?(?:تعالى|سبحانه(?:\s+وتعالى)?)|قوله\s+تعالى|وقال\s+(?:الله\s+)?تعالى)\s*[:،-]?\s*/;

function wordEdit(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function rangeText(s: Sura, from: number, to: number): string {
  return s.ayat
    .filter((a) => a.aya >= from && a.aya <= to)
    .map((a) => a.text)
    .join(" ");
}

export function verifyQuran(claimText: string, suras: Sura[] = loadSuras()): QuranMatch {
  const words = skeletonWords(claimText.replace(PREFIX, ""));
  const n = words.length;
  if (n < MIN_WORDS) return { kind: "none" };
  const needle = words.join(" ");

  // 1) تطابق حرفي (جزء من آية أو آيات متتالية)
  for (const s of suras) {
    let from = 0;
    for (;;) {
      const at = s.joined.indexOf(needle, from);
      if (at < 0) break;
      const okStart = at === 0 || s.joined[at - 1] === " ";
      const end = at + needle.length;
      const okEnd = end === s.joined.length || s.joined[end] === " ";
      if (okStart && okEnd) {
        const wi = s.joined.slice(0, at).split(" ").filter(Boolean).length;
        const a1 = s.ayaOfWord[wi];
        const a2 = s.ayaOfWord[wi + n - 1];
        return { kind: "verified", distance: 0, location: loc(s.n, a1, a2), text: rangeText(s, a1, a2) };
      }
      from = at + 1;
    }
  }

  // 2) أقرب نافذة بمسافة كلمات صغيرة ⇒ تحريف
  if (n < MIN_WORDS_MISQUOTE) return { kind: "none" };
  const maxDist = Math.floor(n / 3);
  let best: { dist: number; s: Sura; start: number; len: number } | null = null;
  const claimSet = new Set(words);
  for (const s of suras) {
    for (let len = n - 1; len <= n + 1; len++) {
      for (let st = 0; st + len <= s.words.length; st++) {
        let shared = 0;
        for (let k = st; k < st + len; k++) if (claimSet.has(s.words[k])) shared++;
        if (shared < Math.ceil(n / 2)) continue;
        const d = wordEdit(words, s.words.slice(st, st + len));
        if (d <= maxDist && (!best || d < best.dist)) best = { dist: d, s, start: st, len };
      }
    }
  }
  if (!best) return { kind: "none" };
  const a1 = best.s.ayaOfWord[best.start];
  const a2 = best.s.ayaOfWord[best.start + best.len - 1];
  return { kind: "misquoted", distance: best.dist, location: loc(best.s.n, a1, a2), text: rangeText(best.s, a1, a2) };
}

const loc = (sura: number, a1: number, a2: number) => `${sura}:${a1}${a2 !== a1 ? `-${a2}` : ""}`;
