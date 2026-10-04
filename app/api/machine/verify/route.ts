import { handleMachineVerify } from "@/lib/api-guard";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleMachineVerify(req);
}
