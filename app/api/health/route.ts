import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStore } from "@/lib/retrieval/store";
import { search } from "@/lib/retrieval/text-index";

export const dynamic = "force-dynamic";

async function readReport(name: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", "index", name), "utf8"));
  } catch {
    return null;
  }
}

/**
 * سطحي بلا استدعاء Gemini: حالة الإعدادات وتقارير البناء (الجلب والفهرس). لا يكشف قيماً.
 * `?deep=1` يحمّل الفهرس ويفحص سلامته (عدد المداخل واستعلام اختباري).
 */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const fetch_report = await readReport("fetch-report.json");
  const index_report = await readReport("index-report.json");
  const body: Record<string, unknown> = {
    ok: fetch_report !== null && index_report !== null,
    config: {
      gemini_key: !!process.env.GEMINI_API_KEY,
      gemini_model: process.env.GEMINI_MODEL ?? null,
    },
    fetch_report,
    index_report,
  };
  if (deep) {
    try {
      const t0 = Date.now();
      const store = await getStore();
      const probe = search(store.index, "اطلبوا العلم ولو بالصين", 3);
      body.deep = {
        loaded_ms: Date.now() - t0,
        entries: store.entries.size,
        curated: store.curated.size,
        indexed_sources: store.indexedSources,
        probe_top: probe[0]?.id ?? null,
        probe_ok: probe.some((h) => h.id === "maqasid-sakhawi#125"),
      };
      body.ok = body.ok && (body.deep as { probe_ok: boolean }).probe_ok && store.entries.size === 1355;
    } catch (e) {
      body.deep = { error: (e as Error).message };
      body.ok = false;
    }
  }
  return Response.json(body, { status: body.ok ? 200 : 503 });
}
