import { handlePublicHealth } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** عام وبلا تفاصيل: {"ok":true}. و?deep=1 يفحص الفهرس تحت تحديد المعدل ويعيد منطقياً فقط. */
export async function GET(req: Request) {
  return handlePublicHealth(req);
}
