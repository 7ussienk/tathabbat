/**
 * جلب متون الكتب وقت البناء (القاعدة 27) — يعمل ضمن `npm run build` وبصورة يدوية للتطوير.
 *
 * - المصدر: https://files.turath.io/books-v3/{turath_book_id}.json (مسار غير موثق وقد يتغير).
 * - طلب واحد في كل مرة، بمهلة، ومحاولات محدودة. لا تحميل متوازٍ.
 * - ذاكرة بناء: .next/cache/tathabbat-books (يحتفظ بها Vercel بين النشرات) لتقليل الطلبات.
 * - المخرج: data/local/{id}.v3.json (خارج Git) + data/index/fetch-report.json (تقني: معرّف/صفحات/حجم/زمن/مصدر).
 * - يتحقق من شكل الملف ويفشل (exit 1) بوضوح إن اختلف، فلا يُنشر بيانات ناقصة بصمت.
 *
 * الاستخدام: tsx scripts/fetch-books.ts [--books maqasid-sakhawi,sahih-muslim] [--refresh]
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { loadManifest, getBook } from "../lib/sources/manifest";

/** كتب البناء الافتراضية. الصحيحان يُضافان بعد أن يعمل المسار كاملاً على المقاصد (القاعدة 27). */
const DEFAULT_BOOKS = ["maqasid-sakhawi", "sahih-bukhari", "sahih-muslim"];

/** توقعات الشكل لكل كتاب (عدد الصفحات في الملف). عدد المداخل (1355 للمقاصد) يُتحقق منه في المقطِّع. */
const EXPECTED_PAGES: Record<number, number> = { 1263: 525, 735: 11290, 1727: 7495 };

const BASE_URL = "https://files.turath.io/books-v3";
const TIMEOUT_MS = 90_000;
const ATTEMPTS = 3;
const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, ".next", "cache", "tathabbat-books");
const OUT_DIR = path.join(ROOT, "data", "local");
const REPORT = path.join(ROOT, "data", "index", "fetch-report.json");

type Source = "network" | "build-cache";
type ReportEntry = { id: string; turath_book_id: number; pages: number; bytes: number; sha256: string; ms: number; source: Source };

class ShapeError extends Error {}

export function validateBookShape(raw: unknown, id: string, turathId: number): number {
  const fail = (why: string): never => {
    throw new ShapeError(`شكل ملف «${id}» (${turathId}) تغيّر: ${why}`);
  };
  if (typeof raw !== "object" || raw === null) return fail("الجذر ليس كائناً");
  const pages = (raw as { pages?: unknown }).pages;
  if (!Array.isArray(pages) || pages.length === 0) return fail("مفتاح pages مفقود أو ليس مصفوفة غير فارغة");
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i] as { text?: unknown; page?: unknown };
    if (typeof p?.text !== "string" || typeof p?.page !== "number") return fail(`الصفحة ${i} بلا text:string وpage:number`);
  }
  const expected = EXPECTED_PAGES[turathId];
  if (expected !== undefined && pages.length !== expected) return fail(`عدد الصفحات ${pages.length} والمتوقع ${expected}`);
  return pages.length;
}

async function download(url: string): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "tathabbat-build/0.1 (build-time fetch)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      console.warn(`  محاولة ${attempt}/${ATTEMPTS} فشلت: ${(e as Error).message}`);
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(`تعذّر جلب ${url}: ${(lastErr as Error).message}`);
}

async function readIfExists(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

async function fetchOne(id: string, refresh: boolean): Promise<ReportEntry> {
  const entry = getBook(loadManifest(), id);
  const tid = entry.turath_book_id;
  const cacheFile = path.join(CACHE_DIR, `${tid}.v3.json`);
  const t0 = Date.now();
  let buf = refresh ? null : await readIfExists(cacheFile);
  let source: Source = "build-cache";
  if (buf) {
    try {
      validateBookShape(JSON.parse(buf.toString("utf8")), id, tid);
    } catch {
      console.warn(`  ذاكرة البناء لـ ${id} غير صالحة؛ يُعاد الجلب`);
      buf = null;
    }
  }
  if (!buf) {
    source = "network";
    console.log(`  جلب ${id} من ${BASE_URL}/${tid}.json …`);
    buf = await download(`${BASE_URL}/${tid}.json`);
  }
  const pages = validateBookShape(JSON.parse(buf.toString("utf8")), id, tid); // يرمي ShapeError عند الاختلاف
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  if (source === "network") {
    const tmp = `${cacheFile}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, cacheFile);
  }
  await writeFile(path.join(OUT_DIR, `${tid}.v3.json`), buf);
  return { id, turath_book_id: tid, pages, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), ms: Date.now() - t0, source };
}

async function main() {
  const args = process.argv.slice(2);
  const bi = args.indexOf("--books");
  const ids = bi >= 0 ? args[bi + 1].split(",").filter(Boolean) : (process.env.FETCH_BOOKS?.split(",").filter(Boolean) ?? DEFAULT_BOOKS);
  const refresh = args.includes("--refresh");
  console.log(`fetch-books: ${ids.join(", ")}${refresh ? " (refresh)" : ""}`);
  const report: ReportEntry[] = [];
  for (const id of ids) {
    // طلب واحد في كل مرة (لا توازٍ)
    const r = await fetchOne(id, refresh);
    report.push(r);
    console.log(`  ✓ ${id}: ${r.pages} صفحة، ${(r.bytes / 1024).toFixed(0)}KB، ${r.ms}ms، المصدر ${r.source}`);
  }
  await mkdir(path.dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify({ fetched_at: new Date().toISOString(), node: process.version, vercel: !!process.env.VERCEL, books: report }, null, 2));
}

if (process.argv[1]?.endsWith("fetch-books.ts")) {
  main().catch((e) => {
    console.error(`\n✗ فشل الجلب: ${(e as Error).message}\nيفشل البناء عمداً ولا يُنشر بيانات ناقصة.`);
    process.exit(1);
  });
}
