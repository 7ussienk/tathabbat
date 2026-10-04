import { readFileSync } from "node:fs";
import path from "node:path";
import { ManifestSchema, type ManifestEntry } from "@/lib/schemas/manifest";

const MANIFEST_PATH = path.join(process.cwd(), "data", "sources", "manifest.json");

export function loadManifest(file = MANIFEST_PATH): ManifestEntry[] {
  return ManifestSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** القاعدة (CLAUDE.md §3): يُرفض أي مصدر بلا مدخل في الـ manifest أو بترخيص فارغ أو يبدأ بـ TODO. */
export function assertUsable(entry: ManifestEntry | undefined, id: string): ManifestEntry {
  if (!entry) throw new Error(`المصدر «${id}» ليس له مدخل في data/sources/manifest.json`);
  const lic = entry.license.trim();
  if (lic === "" || /^TODO/i.test(lic)) {
    throw new Error(`المصدر «${id}» ترخيصه فارغ أو TODO؛ لا يُستخدم قبل حسم الترخيص`);
  }
  return entry;
}

export function getBook(manifest: ManifestEntry[], id: string): ManifestEntry & { turath_book_id: number } {
  const e = assertUsable(
    manifest.find((m) => m.id === id),
    id,
  );
  if (!e.turath_book_id) throw new Error(`المصدر «${id}» بلا turath_book_id في manifest`);
  return e as ManifestEntry & { turath_book_id: number };
}
