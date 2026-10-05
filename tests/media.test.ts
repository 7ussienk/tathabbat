/**
 * استخراج النص من الصوت (/api/transcribe): حدود الحجم والمدة والصيغة، الحمايات، ألا يتسرب النص إلى السجلات، ألا يمس المسار النصي.
 * بمزوّد وهمي بلا شبكة ولا مفاتيح. أي نص هنا تجريبي (القاعدة 9).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMError } from "../lib/llm/provider";
import { MockProvider } from "../lib/llm/mock";
import { estimateAudioSeconds } from "../lib/media/duration";
import { audioRejection, CLARITY_MIN, MAX_AUDIO_BYTES, sniffAudioMime } from "../lib/pipeline/normalize-input";
import { DailyCostMeter } from "../lib/ratelimit/cost";
import { MemoryRateLimitStore } from "../lib/ratelimit/memory";
import { handleTranscribe, MEDIA_DAILY_CAP_PER_IP } from "../lib/transcribe";

/** ملف ogg/opus اصطناعي: صفحة رأس بـ OpusHead وصفحة أخيرة بموضع granule يعطي المدة المطلوبة */
function fakeOgg(seconds: number): Uint8Array {
  const page = (granule: number, payload: number[]) => {
    const h = new Uint8Array(27 + 1 + payload.length);
    h.set([0x4f, 0x67, 0x67, 0x53, 0, 0]); // OggS, version, flags
    new DataView(h.buffer).setUint32(6, granule % 2 ** 32, true);
    new DataView(h.buffer).setUint32(10, Math.floor(granule / 2 ** 32), true);
    h[26] = 1;
    h[27] = payload.length;
    h.set(payload, 28);
    return h;
  };
  const head = page(0, [...new TextEncoder().encode("OpusHead"), 1, 1, 0, 0, 0x80, 0xbb, 0, 0, 0, 0, 0]);
  const tail = page(Math.round(seconds * 48_000), [1, 2, 3]);
  const out = new Uint8Array(head.length + tail.length);
  out.set(head);
  out.set(tail, head.length);
  return out;
}

describe("حدود الصوت (قرار 5 أكتوبر: 30 ثانية و2MB)", () => {
  it("تقدير مدة ogg/opus من رأس الملف، وغير المعروف null", () => {
    expect(estimateAudioSeconds(fakeOgg(12))).toBeCloseTo(12, 1);
    expect(estimateAudioSeconds(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });

  it("استنتاج الصيغة من رأس الملف لا من نوع المتصفح", () => {
    expect(sniffAudioMime(fakeOgg(5), "audio/opus")).toBe("audio/ogg");
    expect(sniffAudioMime(fakeOgg(5), "")).toBe("audio/ogg");
    expect(sniffAudioMime(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]), "")).toBe("audio/mp4");
    expect(sniffAudioMime(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0]), "")).toBe("audio/mpeg");
    expect(sniffAudioMime(new Uint8Array(12), "application/pdf")).toBeNull();
    expect(sniffAudioMime(new Uint8Array(12), "audio/wav")).toBe("audio/wav");
  });

  it("رفض الحجم والصيغة والمدة برسالة عربية تقترح تسجيلاً أقصر", () => {
    expect(audioRejection("audio/ogg", 80_000, 22)).toBeNull();
    expect(audioRejection("audio/ogg", 80_000, null)).toBeNull();
    expect(audioRejection(null, 10, 5)?.code).toBe("unsupported_media");
    expect(audioRejection("audio/ogg", 0, 5)?.code).toBe("invalid_input");
    const big = audioRejection("audio/ogg", MAX_AUDIO_BYTES + 1, 5);
    expect(big?.code).toBe("payload_too_large");
    expect(big?.next_step_ar).toContain("أقصر");
    const long = audioRejection("audio/ogg", 80_000, 45);
    expect(long?.code).toBe("audio_too_long");
    expect(long?.message_ar).toContain("30");
    expect(long?.next_step_ar).toContain("أقصر");
  });
});

describe("/api/transcribe", () => {
  afterEach(() => vi.restoreAllMocks());

  const ENV = { RATE_LIMIT_PER_MIN: "1000", IP_DAILY_CAP: "1000", DAILY_CAP: "1000" } as unknown as NodeJS.ProcessEnv;
  let n = 0;
  const post = (file: File | null, deps: Parameters<typeof handleTranscribe>[2] = {}, store = new MemoryRateLimitStore(), ip = `10.0.0.${++n}`) => {
    const fd = new FormData();
    if (file) fd.append("file", file);
    return handleTranscribe(new Request("http://x/api/transcribe", { method: "POST", body: fd, headers: { "x-forwarded-for": ip } }), store, { env: ENV, meter: new DailyCostMeter(), ...deps });
  };
  const ogg = (s = 10, type = "audio/ogg") => new File([fakeOgg(s) as unknown as BlobPart], "a.ogg", { type });
  const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
  const clear = (text = "نص تجريبي واضح TEST") => new MockProvider({ transcribe: () => ({ transcript: text, clarity: 0.95 }) });

  it("مقطع واضح ⟵ نص فقط بلا تحقق ولا ادعاءات، ونداء نموذج واحد للتفريغ", async () => {
    const llm = clear();
    const r = await post(ogg(), { llm });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok", text: "نص تجريبي واضح TEST", clarity: 0.95 });
    expect(llm.calls.map((c) => c.label)).toEqual(["transcribe"]);
  });

  it("تسجيل المتصفح webm (EBML) بلا مدة في الرأس يُقبل ويُمرَّر كـ audio/webm", async () => {
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffAudioMime(webm, "audio/webm;codecs=opus")).toBe("audio/webm");
    expect(sniffAudioMime(webm, "")).toBe("audio/webm");
    expect(estimateAudioSeconds(webm)).toBeNull();
    const llm = clear();
    const r = await post(new File([webm as unknown as BlobPart], "rec.webm", { type: "audio/webm;codecs=opus" }), { llm });
    expect(r.status).toBe(200);
    expect((llm.calls[0].input as { type: string; mime_type?: string }[])[0]).toMatchObject({ type: "audio", mime_type: "audio/webm" });
  });

  it("نوع المتصفح الفارغ أو audio/opus لا يمنع القبول (يُستنتج من الرأس)", async () => {
    expect((await post(ogg(10, ""), { llm: clear() })).status).toBe(200);
    expect((await post(ogg(10, "audio/opus"), { llm: clear() })).status).toBe(200);
  });

  it("بلا ملف ⟵ 400، وغير صوت ⟵ 415، وأكبر من 2MB ⟵ 413 بلا نداء نموذج", async () => {
    const llm = clear();
    expect((await post(null, { llm })).status).toBe(400);
    const pdf = await post(new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" }), { llm });
    expect(pdf.status).toBe(415);
    expect(await code(pdf)).toBe("unsupported_media");
    const big = await post(new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], "a.ogg", { type: "audio/ogg" }), { llm });
    expect(big.status).toBe(413);
    expect(((await big.json()) as { error: { next_step_ar: string } }).error.next_step_ar).toContain("أقصر");
    expect(llm.calls).toEqual([]);
  });

  it("مقطع أطول من 30 ثانية يُرفض من رأس الملف قبل أي نداء للنموذج", async () => {
    const llm = clear();
    const r = await post(ogg(45), { llm });
    expect(r.status).toBe(422);
    expect(await code(r)).toBe("audio_too_long");
    expect(llm.calls).toEqual([]);
  });

  it("وضوح منخفض أو تفريغ فارغ ⟵ رسالة «لم نتمكن من استخراج نص واضح» بلا نص", async () => {
    for (const t of [{ transcript: "كلام غير واضح TEST", clarity: CLARITY_MIN - 0.1 }, { transcript: "  ", clarity: 0 }]) {
      const r = await post(ogg(), { llm: new MockProvider({ transcribe: () => t }) });
      expect(r.status).toBe(422);
      const body = (await r.json()) as { error: { code: string; message_ar: string; next_step_ar: string }; text?: string };
      expect(body.error.code).toBe("unclear_audio");
      expect(body.error.message_ar).toBe("لم نتمكن من استخراج نص واضح");
      expect(body.error.next_step_ar).toContain("اكتب الرسالة");
      expect(body.text).toBeUndefined();
    }
  });

  it("فشل النموذج أو غيابه ⟵ llm_unavailable 503 برسالة عربية", async () => {
    const r1 = await post(ogg(), { llm: new MockProvider({ transcribe: new LLMError("down", "timeout") }) });
    expect(r1.status).toBe(503);
    expect(await code(r1)).toBe("llm_unavailable");
    expect(await code(await post(ogg(), { llm: null }))).toBe("llm_unavailable");
  });

  it("الحمايات: مفتاح الإيقاف وحد الدقيقة وحد الوسائط اليومي (10 لكل IP) وسقف التكلفة", async () => {
    const llm = clear();
    expect(await code(await post(ogg(), { llm, env: { ...ENV, VERIFY_DISABLED: "1" } as unknown as NodeJS.ProcessEnv }))).toBe("maintenance");
    expect(llm.calls).toEqual([]);

    const minStore = new MemoryRateLimitStore();
    const minEnv = { ...ENV, RATE_LIMIT_PER_MIN: "2" } as unknown as NodeJS.ProcessEnv;
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await post(ogg(), { llm: clear(), env: minEnv }, minStore, "9.9.9.9")).status);
    expect(statuses).toEqual([200, 200, 429]);

    const dayStore = new MemoryRateLimitStore();
    for (let i = 0; i < MEDIA_DAILY_CAP_PER_IP; i++) expect((await post(ogg(), { llm: clear() }, dayStore, "8.8.8.8")).status).toBe(200);
    const over = await post(ogg(), { llm: clear() }, dayStore, "8.8.8.8");
    expect(over.status).toBe(429);
    expect(await code(over)).toBe("media_daily_cap");
    // IP آخر لا يتأثر
    expect((await post(ogg(), { llm: clear() }, dayStore, "8.8.4.4")).status).toBe(200);

    const meter = new DailyCostMeter();
    meter.add(99);
    expect(await code(await post(ogg(), { llm: clear(), meter }))).toBe("daily_cap");
  });

  it("التكلفة تُضاف إلى العدّاد المشترك، ولا يظهر النص المستخرَج في أي سجل", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const meter = new DailyCostMeter();
    const SECRET = "عبارة سرية تجريبية TEST_SECRET_PHRASE";
    await post(ogg(), { llm: clear(SECRET), meter });
    await post(ogg(), { llm: new MockProvider({ transcribe: () => ({ transcript: SECRET, clarity: 0.2 }) }), meter });
    expect(meter.total()).toBeGreaterThan(0);
    const logged = [...log.mock.calls, ...warn.mock.calls].map((c) => c.join(" ")).join("\n");
    expect(logged).toContain('"input_type":"audio"');
    expect(logged).toContain('"route":"/api/transcribe"');
    expect(logged).not.toContain("TEST_SECRET_PHRASE");
    expect(logged).not.toContain("سرية");
  });
});
