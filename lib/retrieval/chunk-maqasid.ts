/**
 * تقطيع «المقاصد الحسنة» (تراث 1263) إلى مداخل (القاعدة 21، القرار 79).
 *
 * - المدخل من سطر العنوان «N - حديث: …» حتى سطر عنوان المدخل التالي، بحد أقصى 4 صفحات (الصفحة الحالية + 3).
 * - المتن فقط: كل ما بعد فاصل الحاشية (`_________`) في الصفحة يُهمل، ومعه علامات الحواشي (^١) وعناوين الأقسام.
 * - المدخل 237 بصيغة «حديث (^١):» فيلتقطه التعبير؛ والرقم 406 غير موجود في الطبعة (الترقيم يقفز 405 ← 407)،
 *   فالمجموع 1355 مدخلاً وآخر رقم 1356.
 * - المدخل الأخير (1356) يقف عند خاتمة المؤلف («وإذ انتهى ما أوردناه…») فلا يبتلع الخاتمة والفهارس.
 * - يفشل التقطيع بوضوح إن اختلفت البنية (لا يُنشر فهرس ناقص بصمت).
 */

export type BookPage = { text: string; vol: string; page: number };
export type BookFile = { pages: BookPage[] };

export type BookEntry = {
  id: string; // maqasid-sakhawi#125
  source_id: string;
  number: number; // الرقم المطبوع للمدخل
  location: string; // «1/63 رقم 125» (أو «1/26-27 رقم 39» إن امتد على صفحتين مطبوعتين)
  vol: string;
  page_start: number; // الصفحة المطبوعة
  page_end: number;
  page_id_start: number; // معرّف صفحة البداية في تراث/الشاملة (فهرس الصفحة في الملف + 1)
  text: string; // نص المدخل حرفياً من المتن (بلا الحواشي وعلامات الحواشي)، يبدأ بـ «حديث:»
  truncated: boolean; // قُطع عند حد الصفحات الأربع قبل بلوغ المدخل التالي
};

export const MAQASID_SOURCE_ID = "maqasid-sakhawi";
export const MAX_PAGES_PER_ENTRY = 4;

export type ChunkSpec = {
  sourceId: string;
  lastNumber: number; // آخر رقم مطبوع
  missingNumbers: number[]; // أرقام قفزت في الطبعة (لا مدخل لها)
  endMarker: string; // بداية خاتمة المؤلف بعد آخر مدخل
};

/** مواصفة المقاصد الحسنة: 1..1356 عدا 406 = 1355 مدخلاً. */
export const MAQASID_SPEC: ChunkSpec = {
  sourceId: MAQASID_SOURCE_ID,
  lastNumber: 1356,
  missingNumbers: [406],
  endMarker: "وإذ انتهى ما أوردناه",
};

const AR = "٠١٢٣٤٥٦٧٨٩";
const toNum = (s: string) => Number([...s].map((c) => AR.indexOf(c)).join(""));
const HEADING = /(?:^|\n)([٠-٩]+) - (حديث)(?: \(\^[٠-٩]+\))?:/g;
const FOOTNOTE_SEP = /\n_{5,}(?:\n|$)/;
const FOOTNOTE_MARK = /[ \t]?\(\^[٠-٩]+\)/g;

export class ChunkError extends Error {}

/** متن الصفحة بلا حاشية ولا عناوين أقسام (`<span data-type="title">`)، مع بقاء علامات الحواشي لتعرُّف سطر العنوان. */
function pageBody(raw: string): string {
  const body = raw.split(FOOTNOTE_SEP)[0];
  return body
    .replace(/<span\b[^>]*data-type="title"[^>]*>[\s\S]*?<\/span>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/^- [^\n\-]{1,4} -\n+/, ""); // علامة رأس الصفحة في المقدمة («- ت -»)
}

function cleanEntry(raw: string): string {
  return raw
    .replace(/^[٠-٩]+ - /, "") // يبدأ بـ «حديث:» لا بالرقم
    .replace(FOOTNOTE_MARK, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Start = { page: number; pos: number; number: number };

export function chunkMaqasid(book: BookFile): BookEntry[] {
  return chunkEntries(book, MAQASID_SPEC);
}

export function chunkEntries(book: BookFile, spec: ChunkSpec): BookEntry[] {
  const pages = book.pages;
  const bodies = pages.map((p) => pageBody(p.text));

  // 1) مواضع عناوين المداخل
  const starts: Start[] = [];
  bodies.forEach((b, k) => {
    for (const m of b.matchAll(HEADING)) {
      const lead = m[0].startsWith("\n") ? 1 : 0;
      starts.push({ page: k, pos: (m.index ?? 0) + lead, number: toNum(m[1]) });
    }
  });

  // 2) التحقق من التسلسل: 1..lastNumber عدا الأرقام القافزة، بلا تكرار
  const expectedNumbers: number[] = [];
  for (let n = 1; n <= spec.lastNumber; n++) if (!spec.missingNumbers.includes(n)) expectedNumbers.push(n);
  if (starts.length !== expectedNumbers.length) {
    throw new ChunkError(`عدد مداخل ${spec.sourceId}: ${starts.length} والمتوقع ${expectedNumbers.length}`);
  }
  starts.forEach((s, i) => {
    if (s.number !== expectedNumbers[i]) {
      throw new ChunkError(`تسلسل المداخل مختل عند الموضع ${i}: وُجد ${s.number} والمتوقع ${expectedNumbers[i]}`);
    }
  });

  // 3) قص المدخل من عنوانه حتى عنوان التالي، بحد أقصى 4 صفحات
  const entries: BookEntry[] = [];
  starts.forEach((s, i) => {
    const next = starts[i + 1];
    const isLast = !next;
    let raw = "";
    let endPage = s.page;
    let truncated = false;
    let reachedNext = false;
    for (let k = s.page; k < pages.length; k++) {
      if (k - s.page >= MAX_PAGES_PER_ENTRY) {
        truncated = true;
        break;
      }
      const from = k === s.page ? s.pos : 0;
      let to = bodies[k].length;
      if (next && k === next.page) {
        to = next.pos;
        reachedNext = true;
      }
      let seg = bodies[k].slice(from, to);
      if (isLast) {
        const at = seg.indexOf(spec.endMarker);
        if (at >= 0) {
          seg = seg.slice(0, at);
          reachedNext = true;
        }
      }
      raw += (raw ? " " : "") + seg;
      endPage = k;
      if (reachedNext) break;
    }
    if (isLast && !reachedNext) throw new ChunkError(`لم تُوجد خاتمة المؤلف بعد آخر مدخل (${s.number}): بنية الكتاب تغيّرت`);
    const p0 = pages[s.page];
    const p1 = pages[endPage];
    const pageRange = p1.vol === p0.vol && p1.page !== p0.page ? `${p0.page}-${p1.page}` : `${p0.page}`;
    entries.push({
      id: `${spec.sourceId}#${s.number}`,
      source_id: spec.sourceId,
      number: s.number,
      location: `${p0.vol}/${pageRange} رقم ${s.number}`,
      vol: p0.vol,
      page_start: p0.page,
      page_end: p1.page,
      page_id_start: s.page + 1,
      text: cleanEntry(raw),
      truncated,
    });
  });
  return entries;
}
