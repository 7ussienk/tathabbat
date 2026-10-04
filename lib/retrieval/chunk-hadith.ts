/**
 * تقطيع دواوين الحديث (الصحيحان) إلى مداخل برقم الحديث (قرار 4 أكتوبر، البند 7).
 *
 * - صحيح البخاري (735، ت البغا): مدخل لكل «N - …» بترقيم البغا؛ المتن فقط (ما بعد `<hr>` شرح المحقق ويُهمل،
 *   وكذلك أسطر الإحالة «[ر: …]» وعناوين الأبواب وما يلي العنوان من تمهيد الباب قبل أول حديث).
 * - صحيح مسلم (1727، ت عبد الباقي): الترقيم المزدوج «تسلسلي - (رقم)»؛ المدخل هو **الرقم الحقيقي** (نحو 3000) تُضم
 *   إليه متابعاته المتتالية بالرقم نفسه، لا 5775 مدخلاً تسلسلياً. أخطاء الطباعة المعروفة تُعالج: رقم حقيقي > 3033
 *   (مثل ٤٥٧٥) أو ترقيم مشوّه لا يُعدّ بداية مدخل فيلتحق بما قبله.
 * - حد أقصى 4 صفحات للمدخل، ويقف عند عنوان الباب التالي.
 * يفشل التقطيع بوضوح إن اختلف العدد المتوقع (لا يُنشر فهرس ناقص بصمت).
 */
import type { BookEntry, BookFile } from "@/lib/retrieval/chunk-maqasid";
import { ChunkError, MAX_PAGES_PER_ENTRY } from "@/lib/retrieval/chunk-maqasid";

export type HadithSpec = {
  sourceId: string;
  /** يطابق بداية مدخل في متن الصفحة (بعد حذف عناوين الأبواب): المجموعة 1 رقم المدخل، والمجموعة 2 (اختيارية) الرقم الحقيقي */
  headingRe: RegExp;
  /** أكبر رقم حقيقي مقبول (يُهمل ما فوقه لأنه خطأ طباعة) */
  maxNumber?: number;
  /** مسلم: متابعات الرقم الحقيقي نفسه تُضم إلى مدخل واحد */
  groupByRealNumber: boolean;
  /** المجلدات (vol) التي تُهمل كلها (مقدمة المحقق ذات السطور المرقّمة) */
  skipVols?: string[];
  /** العدد المتوقع للمداخل في هذه النسخة (يفشل إن اختلف) */
  expectedEntries: number;
};

const AR = "٠١٢٣٤٥٦٧٨٩";
const toNum = (s: string) => Number([...s].map((c) => AR.indexOf(c)).join(""));

const FOOTNOTE_SEP = /\n?<hr>\n?|\n_{5,}(?:\n|$)/;
const TITLE_SPAN = /<span\b[^>]*data-type="title"[^>]*>[\s\S]*?<\/span>/g;

type Ev = { page: number; pos: number; kind: "start" | "break"; number?: number };

const clean = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/^\[[^\]\n]{1,600}\]\.?\s*$/gm, "") // أسطر الإحالة «[ر: ٢٩٨]» و«[٤٢١، ٧١٥]» من المحقق
    .replace(/⦗[٠-٩]+⦘/g, " ") // علامات أرقام الصفحات المطبوعة داخل المتن (مسلم)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** متن الصفحة بلا الحاشية، مع تعويض عناوين الأبواب بعلامة قطع (U+E000) لتعرف مواضعها. */
function pageBody(raw: string): string {
  return raw.split(FOOTNOTE_SEP)[0].replace(TITLE_SPAN, "");
}

export function chunkHadith(book: BookFile, spec: HadithSpec): BookEntry[] {
  const pages = book.pages;
  const skip = new Set(spec.skipVols ?? []);
  const bodies = pages.map((p) => (skip.has(p.vol) ? "" : pageBody(p.text)));

  // 1) أحداث: بدايات المداخل وعلامات القطع (عناوين الأبواب)
  const evs: Ev[] = [];
  bodies.forEach((b, k) => {
    const marks: Ev[] = [];
    for (let i = b.indexOf(""); i >= 0; i = b.indexOf("", i + 1)) marks.push({ page: k, pos: i, kind: "break" });
    const re = new RegExp(spec.headingRe.source, spec.headingRe.flags.includes("g") ? spec.headingRe.flags : `${spec.headingRe.flags}g`);
    for (const m of b.matchAll(re)) {
      const lead = m[0].startsWith("\n") ? 1 : 0;
      const first = toNum(m[1]);
      const num = m[2] !== undefined ? toNum(m[2]) : first;
      if (spec.maxNumber && num > spec.maxNumber) continue; // خطأ طباعة: يلتحق بما قبله
      marks.push({ page: k, pos: (m.index ?? 0) + lead, kind: "start", number: num });
    }
    marks.sort((a, c) => a.pos - c.pos);
    evs.push(...marks);
  });

  // 2) دمج متابعات الرقم الحقيقي نفسه (مسلم): البداية التالية بالرقم نفسه ليست حدّاً
  type Start = { ev: Ev; endEv: Ev | null; id: string; number: number };
  const starts: Start[] = [];
  const idCount = new Map<number, number>();
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    if (e.kind !== "start") continue;
    const prevStart = starts[starts.length - 1];
    // متابعة: بداية بالرقم الحقيقي نفسه ولم يتخللها عنوان باب
    const lastEvBefore = evs[i - 1];
    if (spec.groupByRealNumber && prevStart && prevStart.number === e.number && lastEvBefore?.kind === "start") continue;
    const n = e.number!;
    const c = (idCount.get(n) ?? 0) + 1;
    idCount.set(n, c);
    starts.push({ ev: e, endEv: null, id: c === 1 ? `${spec.sourceId}#${n}` : `${spec.sourceId}#${n}-${c}`, number: n });
  }

  // نهاية كل مدخل: أول حدث (بداية مدخل مختلف أو عنوان باب) بعده
  const posOf = (ev: Ev) => ev.page * 1e7 + ev.pos;
  const startKeys = new Set(starts.map((s) => posOf(s.ev)));
  const boundaries = evs.filter((e) => e.kind === "break" || startKeys.has(posOf(e)));
  starts.forEach((s) => {
    const idx = boundaries.findIndex((e) => posOf(e) === posOf(s.ev));
    s.endEv = boundaries[idx + 1] ?? null;
  });

  if (starts.length !== spec.expectedEntries) {
    throw new ChunkError(`عدد مداخل ${spec.sourceId}: ${starts.length} والمتوقع ${spec.expectedEntries}`);
  }

  // 3) قص النص (حد 4 صفحات)
  return starts.map((s) => {
    let raw = "";
    let endPage = s.ev.page;
    let truncated = false;
    for (let k = s.ev.page; k < pages.length; k++) {
      if (k - s.ev.page >= MAX_PAGES_PER_ENTRY) {
        truncated = true;
        break;
      }
      const from = k === s.ev.page ? s.ev.pos : 0;
      let to = bodies[k].length;
      let reached = false;
      if (s.endEv && k === s.endEv.page) {
        to = s.endEv.pos;
        reached = true;
      }
      const seg = bodies[k].slice(from, to).replace(//g, "");
      raw += (raw ? " " : "") + seg;
      endPage = k;
      if (reached || !s.endEv) break;
    }
    const p0 = pages[s.ev.page];
    const p1 = pages[endPage];
    const range = p1.vol === p0.vol && p1.page !== p0.page ? `${p0.page}-${p1.page}` : `${p0.page}`;
    const text = clean(raw).replace(/^[٠-٩]+ - (?:\([٠-٩]+\)\s*)?/, "");
    return {
      id: s.id,
      source_id: spec.sourceId,
      number: s.number,
      location: `${p0.vol}/${range} رقم ${s.number}`,
      vol: p0.vol,
      page_start: p0.page,
      page_end: p1.page,
      page_id_start: s.ev.page + 1,
      text,
      truncated,
    };
  });
}

/** صحيح البخاري (735): ترقيم البغا. العدد المتوقع يُضبط من قياس النسخة وقت التطوير (انظر build-index). */
export const BUKHARI_SPEC: HadithSpec = {
  sourceId: "sahih-bukhari",
  // عناوين الأبواب والكتب المرقّمة نصاً («٧ - بَاب: …»، «١ - كِتَاب …») ليست أحاديث
  headingRe: /(?:^|\n)([٠-٩]+) - (?!\(|[ً-ْ]*ب[ً-ْ]*ا[ً-ْ]*ب|[ً-ْ]*ك[ً-ْ]*ت[ً-ْ]*ا[ً-ْ]*ب|[ً-ْ]*أ[ً-ْ]*ب[ً-ْ]*و[ً-ْ]*ا[ً-ْ]*ب)/,
  groupByRealNumber: false,
  skipVols: ["المقدمة"],
  expectedEntries: 7125,
};

/** صحيح مسلم (1727): «تسلسلي - (رقم عبد الباقي)»؛ الأرقام الحقيقية فوق 3033 خطأ طباعة. */
export const MUSLIM_SPEC: HadithSpec = {
  sourceId: "sahih-muslim",
  headingRe: /(?:^|\n)([٠-٩]+) - \(([٠-٩]+)\)/,
  maxNumber: 3033,
  groupByRealNumber: true,
  expectedEntries: 3167,
};
