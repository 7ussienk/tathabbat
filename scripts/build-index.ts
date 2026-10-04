/**
 * بناء الفهرس المحلي وقت البناء (القاعدة 22): يقرأ data/local/{id}.v3.json (من fetch-books) و data/curated،
 * يقطّع المداخل، ويكتب data/index/{store.json,text-index.json,index-report.json} (خارج Git).
 * يفشل البناء بوضوح إن اختلفت بنية كتاب (انظر ChunkError). الاستخدام: tsx scripts/build-index.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadManifest, getBook } from "../lib/sources/manifest";
import { chunkMaqasid, MAQASID_SOURCE_ID, type BookEntry, type BookFile } from "../lib/retrieval/chunk-maqasid";
import { bookDoc, buildIndex, curatedDoc } from "../lib/retrieval/text-index";
import { CuratedEntrySchema, type CuratedEntry } from "../lib/schemas/curated";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "index");

/** مقطِّعات الكتب المدعومة. الصحيحان تُضاف بعد أن يعمل المسار كاملاً على المقاصد (القاعدة 27). */
const CHUNKERS: Record<string, (b: BookFile) => BookEntry[]> = {
  [MAQASID_SOURCE_ID]: chunkMaqasid,
};

export async function loadCurated(): Promise<CuratedEntry[]> {
  const raw = await readFile(path.join(ROOT, "data", "curated", "widespread.jsonl"), "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => CuratedEntrySchema.parse(JSON.parse(l)));
}

async function main() {
  const manifest = loadManifest();
  const entries: BookEntry[] = [];
  const checked: { id: string; entries: number; truncated: number }[] = [];
  for (const [id, chunk] of Object.entries(CHUNKERS)) {
    const b = getBook(manifest, id);
    const file = path.join(ROOT, "data", "local", `${b.turath_book_id}.v3.json`);
    let book: BookFile;
    try {
      book = JSON.parse(await readFile(file, "utf8")) as BookFile;
    } catch (e) {
      throw new Error(`تعذّر قراءة ${file}: شغّل scripts/fetch-books أولاً (${(e as Error).message})`);
    }
    const es = chunk(book);
    entries.push(...es);
    checked.push({ id, entries: es.length, truncated: es.filter((x) => x.truncated).length });
  }
  const curated = await loadCurated();
  const docs = [...entries.map(bookDoc), ...curated.map(curatedDoc)];
  const index = buildIndex(docs);
  await mkdir(OUT, { recursive: true });
  const json = JSON.stringify(index);
  await writeFile(path.join(OUT, "text-index.json"), json);
  // بيانات المصادر لوقت التشغيل (العنوان والمؤلف ومعرّف تراث) بلا حاجة لقراءة الـ manifest هناك
  const source_meta: Record<string, { title: string; author?: string; turath_book_id?: number; reviewed: boolean }> = {};
  for (const m of manifest) {
    if (m.type === "remote_service" || m.type === "external_link_only") continue;
    source_meta[m.id] = { title: m.title, author: m.author, turath_book_id: m.turath_book_id ?? undefined, reviewed: m.reviewed };
  }
  await writeFile(path.join(OUT, "store.json"), JSON.stringify({ entries, curated, source_meta }));
  await writeFile(
    path.join(OUT, "index-report.json"),
    JSON.stringify({ built_at: new Date().toISOString(), docs: docs.length, books: checked, curated: curated.length, index_bytes: json.length }, null, 2),
  );
  console.log(`build-index: ${docs.length} وثيقة (${entries.length} مدخل كتب + ${curated.length} curated)، الفهرس ${(json.length / 1024).toFixed(0)}KB`);
  for (const c of checked) console.log(`  ✓ ${c.id}: ${c.entries} مدخلاً، مقطوع بحد الصفحات: ${c.truncated}`);
}

if (process.argv[1]?.endsWith("build-index.ts")) {
  main().catch((e) => {
    console.error(`\n✗ فشل بناء الفهرس: ${(e as Error).message}\nيفشل البناء عمداً ولا يُنشر فهرس ناقص.`);
    process.exit(1);
  });
}
