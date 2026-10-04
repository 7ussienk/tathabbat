import { breakerFor } from "@/lib/llm/gemini";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { EXPECTED_ENTRIES } from "@/lib/retrieval/expected";
import { getStore } from "@/lib/retrieval/store";
import { search } from "@/lib/retrieval/text-index";

async function readReport(name: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", "index", name), "utf8"));
  } catch {
    return null;
  }
}

export type DeepHealth = { ok: boolean; deep?: Record<string, unknown> };

/** فحص سلامة الفهرس المحلي: التحميل، عدد المداخل، واستعلام اختباري معروف. بلا Gemini. */
export async function deepHealth(): Promise<DeepHealth> {
  try {
    const t0 = Date.now();
    const store = await getStore();
    const probe = search(store.index, "اطلبوا العلم ولو بالصين", 3);
    const probe_ok = probe.some((h) => h.id === "maqasid-sakhawi#125");
    const counts: Record<string, number> = {};
    for (const e of store.entries.values()) counts[e.source_id] = (counts[e.source_id] ?? 0) + 1;
    const countsOk = Object.entries(EXPECTED_ENTRIES).every(([id, n]) => counts[id] === n);
    const ok = probe_ok && countsOk;
    return {
      ok,
      deep: {
        loaded_ms: Date.now() - t0,
        entries: store.entries.size,
        entries_by_source: counts,
        counts_ok: countsOk,
        curated: store.curated.size,
        indexed_sources: store.indexedSources,
        probe_top: probe[0]?.id ?? null,
        probe_ok,
      },
    };
  } catch (e) {
    return { ok: false, deep: { error: (e as Error).message } };
  }
}

/** التفاصيل الكاملة (للمسار الآلي فقط): الإعدادات وتقارير البناء (الجلب والفهرس) ونتيجة الفحص العميق. */
export async function detailedHealth(deep: boolean): Promise<Record<string, unknown>> {
  const fetch_report = await readReport("fetch-report.json");
  const index_report = await readReport("index-report.json");
  const body: Record<string, unknown> = {
    ok: fetch_report !== null && index_report !== null,
    config: { gemini_key: !!process.env.GEMINI_API_KEY, gemini_model: process.env.GEMINI_MODEL ?? null },
    fetch_report,
    index_report,
    // قاطع الدائرة للنموذج الأساسي (حالة العملية الحالية فقط): مفتوح ⟵ الطلبات تذهب إلى الاحتياطي حتى openUntil
    llm_breaker: (() => {
      const b = breakerFor(process.env.GEMINI_MODEL ?? "gemini-3.8-flash");
      return { open: b.openUntil > Date.now(), open_until: b.openUntil ? new Date(b.openUntil).toISOString() : null, consecutive_timeouts: b.timeouts };
    })(),
  };
  if (deep) {
    const d = await deepHealth();
    body.deep = d.deep;
    body.ok = (body.ok as boolean) && d.ok;
  }
  return body;
}
