/**
 * يولّد eval/wording_altered.jsonl من مراسي curated الصحيحة (A001–A012) آلياً وبلا اختيار يدوي (قرار 4 أكتوبر):
 *  - فئة hadith_wording_altered (حرجة، مصطنعة): لكل مرساة أربع حالات: تبديل كلمتين متجاورتين، وحذف كلمة (ومنها «لا» حيث وردت)،
 *    واستبدال كلمة بأخرى، وإضافة كلمة. المتوقع wording_differs أو not_found_in_sources ولا authentic أبداً.
 *  - فئة hadith_wording_controls (حرجة): لكل مرساة حالتان مسلَّمتان: اللفظ كما هو، ومعه «انشرها تؤجر» في آخره ⟵ authentic.
 * الحالات المصطنعة للتقييم فقط (القاعدة 14). لا يُعدَّل eval/dataset.jsonl؛ هذا ملف إضافي.
 * الاستخدام: npx tsx scripts/gen-wording-cases.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { normalizeArabic } from "../lib/arabic/normalize";

type Cur = { id: string; claim_text: string; verdict: string; sources: { source_id: string }[] };
const cur: Cur[] = readFileSync("data/curated/widespread.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const anchors = cur.filter((c) => /^A\d{3}$/.test(c.id) && c.sources.some((s) => /^sahih-/.test(s.source_id)));

const REPLACEMENTS = ["كثيرا", "الناس", "شيئا", "علما"];
const ADDED = "كثيرا";
const words = (t: string) => t.replace(/[،.؛:]/g, " ").split(/\s+/).filter(Boolean);

const rows: object[] = [];
anchors.forEach((a, k) => {
  const w = words(a.claim_text);
  const n = w.length;
  const mid = Math.floor(n / 2);
  const base = { input_type: "text", critical: true, synthetic: true, reviewed: false, anchor: a.id };
  const mk = (kind: string, text: string, note: string) =>
    rows.push({
      id: `W${a.id}-${kind}`,
      category: "hadith_wording_altered",
      ...base,
      input: text,
      expected: [{ claim_hint: text, accept: ["wording_differs", "not_found_in_sources"], level: "A" }],
      note: `${note} (مرساة ${a.id})؛ لا يجوز authentic أبداً`,
    });
  // 1) تبديل كلمتين متجاورتين (أول زوج مختلف الكلمتين عند الوسط فما بعده)
  let sw = Math.max(0, mid - 1);
  while (sw < n - 1 && normalizeArabic(w[sw]) === normalizeArabic(w[sw + 1])) sw++;
  if (sw >= n - 1) sw = 0;
  const swapped = [...w];
  [swapped[sw], swapped[sw + 1]] = [swapped[sw + 1], swapped[sw]];
  mk("swap", swapped.join(" "), `تبديل الكلمتين ${sw + 1} و${sw + 2}`);
  // 2) حذف كلمة: «لا» الأولى إن وردت، وإلا الكلمة الوسطى
  const laIdx = w.findIndex((x) => normalizeArabic(x) === "لا");
  const del = laIdx >= 0 ? laIdx : mid;
  mk("delete", w.filter((_, i) => i !== del).join(" "), laIdx >= 0 ? "حذف «لا»" : `حذف الكلمة ${del + 1}`);
  // 3) استبدال كلمة بأخرى (الكلمة الوسطى)
  const rep = REPLACEMENTS.find((r) => normalizeArabic(r) !== normalizeArabic(w[mid])) ?? REPLACEMENTS[0];
  mk("replace", w.map((x, i) => (i === mid ? rep : x)).join(" "), `استبدال الكلمة ${mid + 1} بـ«${rep}»`);
  // 4) إضافة كلمة بعد الوسطى
  mk("add", [...w.slice(0, mid + 1), ADDED, ...w.slice(mid + 1)].join(" "), `إضافة «${ADDED}» بعد الكلمة ${mid + 1}`);
  // ضوابط مسلَّمة
  const control = (kind: string, text: string, note: string) =>
    rows.push({
      id: `C${a.id}-${kind}`,
      category: "hadith_wording_controls",
      ...base,
      input: text,
      expected: [{ claim_hint: a.claim_text, accept: ["authentic"], level: "A", curated_ref: a.id }],
      note: `${note} (مرساة ${a.id})؛ يجب أن يبقى authentic`,
    });
  control("exact", a.claim_text, "اللفظ كما في المنتقى");
  control("share", `${a.claim_text} انشرها تؤجر`, "اللفظ مع «انشرها تؤجر» في آخره");
  void k;
});
writeFileSync("eval/wording_altered.jsonl", rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`${anchors.length} مرساة ⟵ ${rows.length} حالة (${rows.length - anchors.length * 2} معدَّلة + ${anchors.length * 2} ضابطة)`);
