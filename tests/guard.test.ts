/**
 * حماية الإنتاج (قرار 4 أكتوبر مساءً): حد الدقيقة والحد اليومي لكل IP والسقف اليومي وسقف التكلفة التقديري ومفتاح الإيقاف وحدّا النص والادعاءات.
 * مزوّد وهمي ومحدد معدل في الذاكرة: بلا شبكة ولا Gemini.
 */
import { describe, expect, it, vi } from "vitest";
import { handlePublicVerify } from "../lib/api-guard";
import { getConfig } from "../lib/config";
import { MockProvider } from "../lib/llm/mock";
import { MAX_CLAIMS, extractClaims } from "../lib/pipeline/extract-claims";
import { DailyCostMeter } from "../lib/ratelimit/cost";
import { MemoryRateLimitStore } from "../lib/ratelimit/memory";
import { MAX_TEXT_CHARS } from "../lib/verify-message";

const post = (ip: string, text = "نص تجريبي") =>
  new Request("http://x/api/verify", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ text }) });
const okResponse = (cost: number) => ({ status: "ok", claims: [], usage: { input_tokens: 1, output_tokens: 1, cost_usd: cost } }) as never;
const run = (ip: string, env: Record<string, string>, extra: { verify?: () => Promise<never>; store?: MemoryRateLimitStore; meter?: DailyCostMeter } = {}) =>
  handlePublicVerify(post(ip), extra.store ?? new MemoryRateLimitStore(), { env: env as unknown as NodeJS.ProcessEnv, verify: extra.verify ?? (async () => okResponse(0)), meter: extra.meter ?? new DailyCostMeter() });
const body = async (r: Response) => (await r.json()) as { error: { code: string; message_ar: string; next_step_ar: string } };

describe("القيم الافتراضية المعتمدة", () => {
  it("DAILY_CAP=250، RATE_LIMIT_PER_MIN=5، IP_DAILY_CAP=60، COST_DAILY_CAP_USD=1.5، والنص ≤ 3000 والادعاءات ≤ 6", () => {
    const c = getConfig({} as unknown as NodeJS.ProcessEnv);
    expect([c.DAILY_CAP, c.RATE_LIMIT_PER_MIN, c.IP_DAILY_CAP, c.COST_DAILY_CAP_USD]).toEqual([250, 5, 60, 1.5]);
    expect(c.VERIFY_DISABLED).toBeUndefined();
    expect(MAX_TEXT_CHARS).toBe(3000);
    expect(MAX_CLAIMS).toBe(6);
  });
});

describe("handlePublicVerify: الحدود", () => {
  it("حد الدقيقة لكل IP: الطلب السادس (بالافتراضي) 429 rate_limited، وIP آخر يمر", async () => {
    const store = new MemoryRateLimitStore();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await run("1.1.1.1", {}, { store })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await run("2.2.2.2", {}, { store })).status).toBe(200);
  });

  it("الحد اليومي لكل IP", async () => {
    const store = new MemoryRateLimitStore();
    const env = { IP_DAILY_CAP: "2", RATE_LIMIT_PER_MIN: "100" };
    expect((await run("1.1.1.1", env, { store })).status).toBe(200);
    expect((await run("1.1.1.1", env, { store })).status).toBe(200);
    const r = await run("1.1.1.1", env, { store });
    expect(r.status).toBe(429);
    expect((await body(r)).error.code).toBe("ip_daily_cap");
    expect((await run("9.9.9.9", env, { store })).status).toBe(200);
  });

  it("السقف اليومي الإجمالي عبر كل المستخدمين", async () => {
    const store = new MemoryRateLimitStore();
    const env = { DAILY_CAP: "2", RATE_LIMIT_PER_MIN: "100" };
    await run("1.1.1.1", env, { store });
    await run("2.2.2.2", env, { store });
    const r = await run("3.3.3.3", env, { store });
    expect(r.status).toBe(429);
    expect((await body(r)).error.code).toBe("daily_cap");
  });

  it("سقف التكلفة التقديري: بعد تجاوز 1.5$ تُرفض الطلبات بلا نداء، ويُصفَّر بتغيّر اليوم", async () => {
    let t = Date.UTC(2026, 9, 4, 12);
    const meter = new DailyCostMeter(() => t);
    const verify = vi.fn(async () => okResponse(1.0));
    const store = new MemoryRateLimitStore();
    const env = { RATE_LIMIT_PER_MIN: "100", DAILY_CAP: "1000", IP_DAILY_CAP: "1000" };
    expect((await run("1.1.1.1", env, { store, meter, verify })).status).toBe(200); // 1.0
    expect((await run("1.1.1.1", env, { store, meter, verify })).status).toBe(200); // 2.0 (الفحص قبل الطلب: 1.0 < 1.5)
    const blocked = await run("1.1.1.1", env, { store, meter, verify });
    expect(blocked.status).toBe(429);
    expect((await body(blocked)).error.code).toBe("daily_cap");
    expect(verify).toHaveBeenCalledTimes(2);
    t += 24 * 3600_000; // اليوم التالي
    expect((await run("1.1.1.1", env, { store, meter, verify })).status).toBe(200);
  });

  it("VERIFY_DISABLED=1 ⟵ رسالة صيانة 503 بلا أي معالجة ولا عدّ للطلبات", async () => {
    const verify = vi.fn(async () => okResponse(0));
    const store = new MemoryRateLimitStore();
    const hit = vi.spyOn(store, "hit");
    const r = await run("1.1.1.1", { VERIFY_DISABLED: "1" }, { verify, store });
    expect(r.status).toBe(503);
    const b = await body(r);
    expect(b.error.code).toBe("maintenance");
    expect(b.error.message_ar).toContain("صيانة");
    expect(verify).not.toHaveBeenCalled();
    expect(hit).not.toHaveBeenCalled();
    // قيمة أخرى لا تعطّل
    expect((await run("1.1.1.1", { VERIFY_DISABLED: "0" })).status).toBe(200);
  });

  it("كل رسائل الأخطاء عربية واضحة بلا تفاصيل داخلية (تكلفة/دولار/أرقام السقوف)", async () => {
    const msgs: string[] = [];
    for (const [env, ip] of [
      [{ VERIFY_DISABLED: "1" }, "a"],
      [{ RATE_LIMIT_PER_MIN: "0" }, "b"],
      [{ IP_DAILY_CAP: "0" }, "c"],
      [{ DAILY_CAP: "0" }, "d"],
    ] as const) {
      const b = await body(await run(ip, env));
      msgs.push(b.error.message_ar, b.error.next_step_ar);
    }
    const meter = new DailyCostMeter();
    meter.add(99);
    const b = await body(await run("e", {}, { meter }));
    msgs.push(b.error.message_ar, b.error.next_step_ar);
    for (const m of msgs) {
      expect(m).toMatch(/[؀-ۿ]/);
      expect(m).not.toMatch(/cost|usd|\$|دولار|تكلفة|250|60|1\.5|COST|CAP/i);
    }
  });
});

describe("حدّا النص والادعاءات", () => {
  it("نص أطول من 3000 حرف ⟵ 400 invalid_input بلا نداء نموذج", async () => {
    const r = await handlePublicVerify(post("1.1.1.1", "ا".repeat(MAX_TEXT_CHARS + 1)), new MemoryRateLimitStore(), { env: {} as unknown as NodeJS.ProcessEnv, meter: new DailyCostMeter() });
    expect(r.status).toBe(400);
    expect((await body(r)).error.code).toBe("invalid_input");
  });

  it("المستخرِج لا يعيد أكثر من 6 ادعاءات", async () => {
    const text = Array.from({ length: 8 }, (_, i) => `ادعاء${i} مختلف`).join("\n");
    const llm = new MockProvider({
      extract: () => ({ claims: Array.from({ length: 8 }, (_, i) => ({ claim_text: `ادعاء${i} مختلف`, claim_type: "hadith", content_level: "A", understood_as: "x" })) }),
    });
    expect((await extractClaims(llm, text)).claims).toHaveLength(6);
  });
});

describe("المسار الآلي بالتوكن (/api/machine/verify)", () => {
  const withToken = (ip = "7.7.7.7", token = "tok-test-123456") =>
    new Request("http://x/api/machine/verify", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-forwarded-for": ip }, body: JSON.stringify({ text: "نص" }) });
  const call = async (req: Request, env: Record<string, string>, meter: DailyCostMeter, verify = vi.fn(async () => okResponse(1.0))) => {
    const { handleMachineVerify } = await import("../lib/api-guard");
    return { r: await handleMachineVerify(req, { env: env as unknown as NodeJS.ProcessEnv, meter, verify }), verify };
  };

  it("بلا توكن صحيح ⟵ 401 بلا معالجة؛ والسقف الافتراضي 3$ وهو أعلى من العام (1.5$)", async () => {
    process.env.VERIFY_API_TOKEN = "tok-test-123456";
    const meter = new DailyCostMeter();
    const bad = await call(withToken("1.1.1.1", "wrong"), {}, meter);
    expect(bad.r.status).toBe(401);
    expect(bad.verify).not.toHaveBeenCalled();
    const c = getConfig({} as unknown as NodeJS.ProcessEnv);
    expect(c.MACHINE_COST_DAILY_CAP_USD).toBe(3);
    expect(c.MACHINE_COST_DAILY_CAP_USD).toBeGreaterThan(c.COST_DAILY_CAP_USD);
  });

  it("يعمل بالتوكن حتى بلوغ سقف التكلفة اليومي ثم 429 بلا نداء", async () => {
    process.env.VERIFY_API_TOKEN = "tok-test-123456";
    const meter = new DailyCostMeter();
    const verify = vi.fn(async () => okResponse(1.7));
    expect((await call(withToken(), {}, meter, verify)).r.status).toBe(200); // 1.7
    expect((await call(withToken(), {}, meter, verify)).r.status).toBe(200); // 3.4 (الفحص قبل الطلب: 1.7 < 3)
    const blocked = await call(withToken(), {}, meter, verify);
    expect(blocked.r.status).toBe(429);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("VERIFY_DISABLED=1 يوقفه أيضاً", async () => {
    process.env.VERIFY_API_TOKEN = "tok-test-123456";
    const { r, verify } = await call(withToken(), { VERIFY_DISABLED: "1" }, new DailyCostMeter());
    expect(r.status).toBe(503);
    expect(verify).not.toHaveBeenCalled();
  });
});
