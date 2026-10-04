import { timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config";
import { sharedMemoryStore } from "@/lib/ratelimit/memory";
import type { RateLimitStore } from "@/lib/ratelimit/store";
import { MAX_TEXT_CHARS, verifyMessage } from "@/lib/verify-message";

const MAX_BODY_BYTES = 64 * 1024;
const MINUTE = 60_000;
const DAY = 86_400_000;

export const err = (status: number, code: string, message_ar: string, next_step_ar: string) =>
  Response.json({ status: "error", error: { code, message_ar, next_step_ar } }, { status });

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

async function readText(req: Request): Promise<{ text: string } | Response> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) return err(413, "payload_too_large", "حجم الطلب كبير.", `أرسل نصاً أقصر من ${MAX_TEXT_CHARS} حرفاً.`);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_input", "تعذّرت قراءة الطلب.", "أرسل JSON بالصيغة {\"text\": \"...\"}.");
  }
  const text = (body as { text?: unknown })?.text;
  if (typeof text !== "string") return err(400, "invalid_input", "الحقل text مفقود أو ليس نصاً.", "أرسل JSON بالصيغة {\"text\": \"...\"}.");
  return { text };
}

function httpStatus(r: { status: string; error?: { code: string } }): number {
  if (r.status === "error") return r.error?.code === "invalid_input" ? 400 : 503;
  return 200;
}

/** /api/verify العام: بلا مفتاح، محدَّد المعدل لكل IP + سقف يومي تقريبي لكل نسخة. */
export async function handlePublicVerify(req: Request, store: RateLimitStore = sharedMemoryStore()): Promise<Response> {
  const cfg = getConfig();
  const ip = clientIp(req);
  if ((await store.hit(`ip:${ip}`, MINUTE)) > cfg.RATE_LIMIT_PER_MIN) {
    return err(429, "rate_limited", "أرسلت طلبات كثيرة خلال دقيقة.", "انتظر دقيقة ثم أعد المحاولة.");
  }
  if ((await store.hit("daily", DAY)) > cfg.DAILY_CAP) {
    return err(429, "daily_cap", "بلغت الأداة سقفها اليومي التقريبي للطلبات.", "حاول غداً، أو تحقق بنفسك عبر رابط البحث في الدرر السنية.");
  }
  const t = await readText(req);
  if (t instanceof Response) return t;
  const result = await verifyMessage({ type: "text", text: t.text }, { route: "/api/verify" });
  return Response.json(result, { status: httpStatus(result) });
}

/** المسار الآلي للتقييم: يتطلب Authorization: Bearer VERIFY_API_TOKEN، بلا تحديد معدل. */
export async function handleMachineVerify(req: Request): Promise<Response> {
  const token = getConfig().VERIFY_API_TOKEN;
  const given = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(token ?? "");
  if (!token || a.length !== b.length || !timingSafeEqual(a, b)) {
    return err(401, "unauthorized", "غير مصرّح.", "أرسل ترويسة Authorization صحيحة.");
  }
  const t = await readText(req);
  if (t instanceof Response) return t;
  const result = await verifyMessage({ type: "text", text: t.text }, { route: "/api/machine/verify" });
  return Response.json(result, { status: httpStatus(result) });
}
