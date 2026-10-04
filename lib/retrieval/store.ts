/**
 * تحميل الفهرس المحلي المبني وقت البناء (data/index/) في الذاكرة مرة واحدة لكل نسخة.
 * لا شبكة ولا كتابة على القرص وقت التشغيل (CLAUDE.md §9.1). فشل التحميل يعني أن حالة الاسترجاع
 * `search_unavailable` لا `not_found_in_sources` (القاعدة 24).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type MiniSearch from "minisearch";
import type { BookEntry } from "@/lib/retrieval/chunk-maqasid";
import { loadIndex, type IndexDoc } from "@/lib/retrieval/text-index";
import type { CuratedEntry } from "@/lib/schemas/curated";

export type Store = {
  index: MiniSearch<IndexDoc>;
  entries: Map<string, BookEntry>;
  curated: Map<string, CuratedEntry>;
  /** الكتب المفهرسة فعلاً (checked_sources) */
  indexedSources: string[];
  loadedAt: number;
};

let cached: Promise<Store> | null = null;

const dir = () => path.join(process.cwd(), "data", "index");

async function load(): Promise<Store> {
  const [indexJson, storeJson] = await Promise.all([
    readFile(path.join(dir(), "text-index.json"), "utf8"),
    readFile(path.join(dir(), "store.json"), "utf8"),
  ]);
  const raw = JSON.parse(storeJson) as { entries: BookEntry[]; curated: CuratedEntry[] };
  const entries = new Map(raw.entries.map((e) => [e.id, e]));
  const curated = new Map(raw.curated.map((c) => [c.id, c]));
  return {
    index: loadIndex(indexJson),
    entries,
    curated,
    indexedSources: [...new Set(raw.entries.map((e) => e.source_id))],
    loadedAt: Date.now(),
  };
}

export function getStore(): Promise<Store> {
  if (!cached) {
    cached = load().catch((e) => {
      cached = null; // لا نخزّن الفشل؛ المحاولة التالية تعيد التحميل
      throw e;
    });
  }
  return cached;
}
