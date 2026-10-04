import { handleMachineHealth } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** التفاصيل (الإعدادات وتقارير الجلب والفهرس والفحص العميق): تتطلب Authorization: Bearer VERIFY_API_TOKEN. */
export async function GET(req: Request) {
  return handleMachineHealth(req);
}
