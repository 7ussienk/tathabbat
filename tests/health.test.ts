import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { handleMachineHealth, handlePublicHealth, handleMachineVerify } from "../lib/api-guard";
import { MemoryRateLimitStore } from "../lib/ratelimit/memory";
import { EXPECTED_TOTAL } from "../lib/retrieval/expected";

const ready = existsSync("data/index/text-index.json") && existsSync("data/index/store.json");
const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

describe("health (عام بلا تفاصيل، والتفاصيل بتوكن)", () => {
  afterEach(() => {
    delete process.env.VERIFY_API_TOKEN;
    delete process.env.RATE_LIMIT_PER_MIN;
  });

  it("العام يعيد {\"ok\":true} فقط بلا أي تفاصيل", async () => {
    const r = await handlePublicHealth(req("/api/health"), new MemoryRateLimitStore());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it.skipIf(!ready)("?deep=1 يعيد منطقياً فقط، ويخضع لتحديد المعدل (429 بعد الحد)", async () => {
    process.env.RATE_LIMIT_PER_MIN = "3";
    const store = new MemoryRateLimitStore();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await handlePublicHealth(req("/api/health?deep=1", { headers: { "x-forwarded-for": "1.2.3.4" } }), store);
      codes.push(r.status);
      if (r.status === 200) expect(await r.json()).toEqual({ ok: true });
    }
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it("التفاصيل (الإعدادات وتقارير البناء) تتطلب توكن: 401 بلا توكن أو بتوكن خاطئ", async () => {
    process.env.VERIFY_API_TOKEN = "test-token-123456";
    expect((await handleMachineHealth(req("/api/machine/health"))).status).toBe(401);
    expect((await handleMachineHealth(req("/api/machine/health", { headers: { authorization: "Bearer nope" } }))).status).toBe(401);
    expect((await handleMachineVerify(req("/api/machine/verify", { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it.skipIf(!ready)("بالتوكن الصحيح تظهر التفاصيل والفحص العميق", async () => {
    process.env.VERIFY_API_TOKEN = "test-token-123456";
    const r = await handleMachineHealth(req("/api/machine/health?deep=1", { headers: { authorization: "Bearer test-token-123456" } }));
    const b = (await r.json()) as { ok: boolean; deep: { entries: number; probe_ok: boolean }; fetch_report: unknown; config: unknown };
    expect(r.status).toBe(200);
    expect(b.deep.entries).toBe(EXPECTED_TOTAL);
    expect(b.deep.probe_ok).toBe(true);
    expect(b.config).toBeDefined();
  });

  it("بلا VERIFY_API_TOKEN في البيئة يُرفض كل شيء (لا مسار مفتوح بالخطأ)", async () => {
    expect((await handleMachineHealth(req("/api/machine/health", { headers: { authorization: "Bearer " } }))).status).toBe(401);
  });
});
