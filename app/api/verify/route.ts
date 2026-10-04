import { handlePublicVerify } from "@/lib/api-guard";

// معالجة الصوت والصور قد تطول؛ هذا الحد يُراجَع مع خطة Vercel المستخدمة (CLAUDE.md §9.1)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handlePublicVerify(req);
}
