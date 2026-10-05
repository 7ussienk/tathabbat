import { handleTranscribe } from "@/lib/transcribe";

// تفريغ مقطع ≤ 30 ثانية: مهلة النداء 20ث على كل نموذج، والسقف هنا 60ث (CLAUDE.md §9.1)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleTranscribe(req);
}
