import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/** سطحي بلا استدعاء Gemini: حالة الإعدادات وتقرير جلب الكتب وقت البناء. لا يكشف قيماً. */
export async function GET() {
  let fetchReport: unknown = null;
  try {
    fetchReport = JSON.parse(await readFile(path.join(process.cwd(), "data", "index", "fetch-report.json"), "utf8"));
  } catch {
    fetchReport = null;
  }
  return Response.json({
    ok: fetchReport !== null,
    config: {
      gemini_key: !!process.env.GEMINI_API_KEY,
      gemini_model: process.env.GEMINI_MODEL ?? null,
    },
    fetch_report: fetchReport,
  });
}
