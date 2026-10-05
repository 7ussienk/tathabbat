/**
 * /api/transcribe: يستقبل مقطعاً صوتياً ويعيد **نصاً فقط بلا تحقق** (قرار 5 أكتوبر). تضعه الواجهة في مربع الرسالة ليراجعه المستخدم،
 * ثم يضغط «تثبّت» عبر المسار النصي القائم (verifyMessage) بلا أي تغيير فيه. بلا ردود صوتية.
 *
 * الحمايات بترتيب /api/verify نفسه وبالعدّادات المشتركة نفسها (حد الدقيقة واليوم لكل IP والسقف الإجمالي وسقف التكلفة ومفتاح الإيقاف)،
 * مع حد يومي منفصل للوسائط لكل IP. العدّادات تقريبية لكل نسخة (القرار 58). لا يُحفظ الصوت ولا النص المستخرَج في أي سجل (القاعدة 7).
 */
import { randomUUID } from "node:crypto";
import { clientIp, err } from "@/lib/api-guard";
import { getConfig } from "@/lib/config";
import { GeminiProvider } from "@/lib/llm/gemini";
import { LLMError, type LLMProvider } from "@/lib/llm/provider";
import { logRequest } from "@/lib/log";
import { estimateAudioSeconds } from "@/lib/media/duration";
import { audioRejection, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, sniffAudioMime, transcribeAudio } from "@/lib/pipeline/normalize-input";
import { sharedCostMeter, type DailyCostMeter } from "@/lib/ratelimit/cost";
import { sharedMemoryStore } from "@/lib/ratelimit/memory";
import type { RateLimitStore } from "@/lib/ratelimit/store";

const MINUTE = 60_000;
const DAY = 86_400_000;
/** الحد اليومي للوسائط لكل IP (قرار 5 أكتوبر) */
export const MEDIA_DAILY_CAP_PER_IP = 10;
/** سعر توكنز الصوت للمليون (أعلى من النص؛ تقدير للتكلفة والسقف اليومي) */
const AUDIO_PRICE_IN_PER_M = 3.0;
/** سماح قياس المدة من توكنز الدخل (يشمل توكنز البرومت) حين لا يُعرف رأس الملف */
const EST_SLACK_SECONDS = 10;
const FORM_OVERHEAD_BYTES = 64 * 1024;

const SEARCH_HINT = "اكتب الرسالة بدل ذلك، أو حاول غداً.";
const STATUS: Record<string, number> = { invalid_input: 400, payload_too_large: 413, unsupported_media: 415, audio_too_long: 422, unclear_audio: 422 };

export type TranscribeDeps = { llm?: LLMProvider | null; meter?: DailyCostMeter; env?: NodeJS.ProcessEnv };

export async function handleTranscribe(req: Request, store: RateLimitStore = sharedMemoryStore(), deps: TranscribeDeps = {}): Promise<Response> {
  const t0 = Date.now();
  const cfg = getConfig(deps.env);
  if (cfg.VERIFY_DISABLED === "1") return err(503, "maintenance", "الأداة في صيانة مؤقتة.", "حاول بعد قليل، أو اكتب الرسالة.");
  const ip = clientIp(req);
  if ((await store.hit(`ip:${ip}`, MINUTE)) > cfg.RATE_LIMIT_PER_MIN) {
    return err(429, "rate_limited", "أرسلت طلبات كثيرة خلال دقيقة.", "انتظر دقيقة ثم أعد المحاولة.");
  }
  if ((await store.hit(`ipday:${ip}`, DAY)) > cfg.IP_DAILY_CAP) {
    return err(429, "ip_daily_cap", "بلغت الحد اليومي للطلبات من جهازك.", SEARCH_HINT);
  }
  if ((await store.hit(`mediaday:${ip}`, DAY)) > MEDIA_DAILY_CAP_PER_IP) {
    return err(429, "media_daily_cap", "بلغت الحد اليومي للمقاطع الصوتية من جهازك.", SEARCH_HINT);
  }
  const meter = deps.meter ?? sharedCostMeter();
  if ((await store.hit("daily", DAY)) > cfg.DAILY_CAP || meter.total() >= cfg.COST_DAILY_CAP_USD) {
    return err(429, "daily_cap", "بلغت الأداة سقفها اليومي التقريبي للطلبات.", SEARCH_HINT);
  }

  const reject = (r: { code: string; message_ar: string; next_step_ar: string }) => err(STATUS[r.code] ?? 400, r.code, r.message_ar, r.next_step_ar);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES + FORM_OVERHEAD_BYTES) return reject(audioRejection(null, MAX_AUDIO_BYTES + 1, null)!);
  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    if (f instanceof File) file = f;
  } catch {
    /* يُعامَل كطلب بلا ملف */
  }
  if (!file) return err(400, "invalid_input", "لم يصل مقطع صوتي.", "اختر ملفاً صوتياً ثم أعد المحاولة.");
  if (file.size > MAX_AUDIO_BYTES) return reject(audioRejection(null, file.size, null)!);
  const data = new Uint8Array(await file.arrayBuffer());
  const mime = sniffAudioMime(data, file.type);
  // 0 أو null ⟵ غير معروفة (تسجيلات MediaRecorder بلا مدة في الرأس): يبقى قياس التوكنز خط دفاع ثانياً
  const seconds = estimateAudioSeconds(data) || null;
  const rejected = audioRejection(mime, data.length, seconds);
  if (rejected) return reject(rejected);

  const base = { request_id: randomUUID(), route: "/api/transcribe", input_type: "audio" as const, claims_count: 0, verdicts: [] as string[], downgrades: 0 };
  const llm =
    deps.llm !== undefined
      ? deps.llm
      : cfg.GEMINI_API_KEY
        ? new GeminiProvider({ apiKey: cfg.GEMINI_API_KEY, model: cfg.GEMINI_MODEL, fallbackModel: cfg.GEMINI_FALLBACK_MODEL, firstTimeoutMs: 20_000, fallbackTimeoutMs: 20_000 })
        : null;
  const fail = (code: string, message_ar: string, next_step_ar: string, status: number) => {
    logRequest({ ...base, ts: new Date().toISOString(), status: "error", error_code: code, duration_ms: Date.now() - t0, tokens_in: 0, tokens_out: 0, cost_estimate_usd: 0 });
    return err(status, code, message_ar, next_step_ar);
  };
  const unavailable = () => fail("llm_unavailable", "تعذّر استخراج النص من المقطع الآن.", "حاول بعد قليل، أو اكتب الرسالة.", 503);
  if (!llm) return unavailable();

  let r;
  try {
    r = await transcribeAudio(llm, { data, mime_type: mime! });
  } catch (e) {
    if (e instanceof LLMError) return unavailable();
    throw e;
  }
  const cost = (r.usage.input_tokens * AUDIO_PRICE_IN_PER_M + r.usage.output_tokens * cfg.PRICE_OUT_PER_M) / 1e6;
  meter.add(cost);
  const attempts = r.meta?.attempts ?? [];
  // سجل تقني فقط: لا نص ولا ملف (القاعدة 7 و26)
  const log = (status: string, error_code?: string) =>
    logRequest({
      ...base,
      ts: new Date().toISOString(),
      status,
      error_code,
      duration_ms: Date.now() - t0,
      tokens_in: r.usage.input_tokens,
      tokens_out: r.usage.output_tokens,
      cost_estimate_usd: Math.round(cost * 1e6) / 1e6,
      llm_calls: [{ label: "transcribe", attempts: attempts.map((a) => ({ model: a.model, ms: a.ms, outcome: a.outcome })) }],
      served_models: attempts.filter((a) => a.outcome === "ok").map((a) => a.model),
    });

  // خط الدفاع الثاني للمدة: حين لا يُعرف رأس الملف يُقاس طول المقطع من توكنز الدخل
  if (seconds === null && r.audio_seconds_est > MAX_AUDIO_SECONDS + EST_SLACK_SECONDS) {
    log("error", "audio_too_long");
    return reject(audioRejection(mime, data.length, r.audio_seconds_est)!);
  }
  if (r.unclear) {
    log("error", "unclear_audio");
    return err(422, "unclear_audio", "لم نتمكن من استخراج نص واضح", "حاول بتسجيل أوضح أو اكتب الرسالة");
  }
  log("ok");
  return Response.json({ status: "ok", text: r.text, clarity: r.clarity });
}
