/**
 * يطبع جدول المصادر من data/sources/manifest.json مع حالة كل مصدر في المشروع:
 * مفهرس (في الفهرس الحي) | منتقى فقط (مذكور في data/curated بلا فهرسة) | رابط فقط | غير مفهرس.
 * الاستخدام: npx tsx scripts/manifest-table.ts
 */
import { readFileSync, readdirSync } from "node:fs";

type M = { id: string; title: string; author?: string; madhhab: string; type: string; edition?: string; shamela_book_id?: number; turath_book_id?: number };
const manifest: M[] = JSON.parse(readFileSync("data/sources/manifest.json", "utf8"));
const report = JSON.parse(readFileSync("data/index/index-report.json", "utf8")) as { books: { id: string; entries: number }[] };

const indexed = new Set<string>(report.books.map((b) => b.id));
const entries = new Map(report.books.map((b) => [b.id, b.entries]));
const curated = new Set<string>();
for (const f of readdirSync("data/curated").filter((x) => x.endsWith(".jsonl"))) {
  for (const l of readFileSync(`data/curated/${f}`, "utf8").split("\n").filter(Boolean)) {
    for (const s of (JSON.parse(l).sources ?? []) as { source_id: string }[]) curated.add(s.source_id);
  }
}

const status = (m: M) => {
  if (m.type === "remote_service" || m.type === "external_link_only") return "رابط فقط";
  if (m.type === "quran") return "نص محلي كامل (Tanzil)";
  if (indexed.has(m.id)) return curated.has(m.id) ? "مفهرس (+ منتقى)" : "مفهرس";
  if (curated.has(m.id)) return "منتقى فقط";
  return "غير مفهرس";
};

console.log("| المعرّف | المؤلف | المذهب/النوع | الشاملة | تراث | الطبعة | الحالة |");
console.log("|---|---|---|---|---|---|---|");
for (const m of manifest) {
  console.log(`| ${m.id} | ${m.author ?? "—"} | ${m.madhhab ?? m.type} | ${m.shamela_book_id || "—"} | ${m.turath_book_id || "—"} | ${m.edition ?? "—"} | ${status(m)}${entries.has(m.id) ? ` (${entries.get(m.id)} مدخلاً)` : ""} |`);
}
const count = (s: string) => manifest.filter((m) => status(m).startsWith(s)).length;
console.log(`\nالمجموع ${manifest.length}: مفهرس ${count("مفهرس")}، منتقى فقط ${count("منتقى فقط")}، غير مفهرس ${count("غير مفهرس")}، رابط فقط ${count("رابط فقط")}، قرآن ${count("نص محلي")}`);
