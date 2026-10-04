/** قاطع الدائرة لنموذج Gemini الأساسي (قرار 4 أكتوبر مساءً): بلا شبكة، `once` مُبرمَج. */
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { BREAKER_OPEN_MS, BREAKER_THRESHOLD, GeminiProvider, breakerFor, resetBreakers } from "../lib/llm/gemini";
import { LLMError } from "../lib/llm/provider";

type Behavior = "ok" | "timeout" | "400" | "503";
let clock = 1_000_000;

class Scripted extends GeminiProvider {
  calls: string[] = [];
  behave: Record<string, Behavior> = { primary: "ok", fallback: "ok" };
  constructor() {
    super({ apiKey: "test", model: "primary", fallbackModel: "fallback", firstTimeoutMs: 1, fallbackTimeoutMs: 1, now: () => clock });
  }
  protected override async once<T>(_req: unknown, model: string): Promise<{ data: T; usage: { input_tokens: number; output_tokens: number; thought_tokens: number } }> {
    this.calls.push(model);
    const b = this.behave[model];
    if (b === "timeout") throw new LLMError("timeout", "timeout");
    if (b === "400") throw new LLMError("400 Request contains an invalid argument.", "unavailable");
    if (b === "503") throw new LLMError("503 UNAVAILABLE", "unavailable");
    return { data: { v: "x" } as T, usage: { input_tokens: 1, output_tokens: 1, thought_tokens: 0 } };
  }
  go() {
    return this.generateJson({ label: "judge", system: "s", input: "i", schema: z.object({ v: z.string() }) });
  }
}

beforeEach(() => {
  resetBreakers();
  clock = 1_000_000;
});

describe("قاطع الدائرة", () => {
  it("ثلاث مهلات متتالية للأساسي ⟵ الطلب التالي يذهب إلى الاحتياطي مباشرة بلا لمس الأساسي", async () => {
    const p = new Scripted();
    p.behave = { primary: "timeout", fallback: "ok" };
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      const r = await p.go();
      expect(r.meta?.attempts.map((a) => a.model)).toEqual(["primary", "fallback"]);
      expect(r.meta?.note).toBeUndefined();
    }
    p.calls = [];
    const r = await p.go();
    expect(p.calls).toEqual(["fallback"]);
    expect(r.meta?.note).toBe("breaker_open");
    expect(r.meta?.attempts.map((a) => `${a.model}:${a.outcome}`)).toEqual(["fallback:ok"]);
  });

  it("نجاح الأساسي يصفّر العدّاد: مهلتان ثم نجاح ثم مهلتان ⟵ لا يُفتح", async () => {
    const p = new Scripted();
    for (const b of ["timeout", "timeout", "ok", "timeout", "timeout"] as Behavior[]) {
      p.behave.primary = b;
      await p.go();
    }
    p.calls = [];
    p.behave.primary = "ok";
    await p.go();
    expect(p.calls).toEqual(["primary"]);
  });

  it("يبقى مفتوحاً 5 دقائق ثم يجرّب الأساسي بطلب واحد (probe) فيما يتجاوزه غيره", async () => {
    const p = new Scripted();
    p.behave.primary = "timeout";
    for (let i = 0; i < BREAKER_THRESHOLD; i++) await p.go();
    clock += BREAKER_OPEN_MS - 1000;
    p.calls = [];
    expect((await p.go()).meta?.note).toBe("breaker_open"); // قبل انتهاء الخمس دقائق
    expect(p.calls).toEqual(["fallback"]);
    clock += 2000; // بعد الخمس دقائق
    p.behave.primary = "ok";
    // probe: أول طلب يجرّب الأساسي؛ طلب متزامن معه يتجاوزه
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = p.behave;
    const orig = (p as unknown as { once: (r: unknown, m: string) => Promise<unknown> }).once.bind(p);
    (p as unknown as { once: (r: unknown, m: string) => Promise<unknown> }).once = async (r, m) => {
      if (m === "primary") await gate;
      return orig(r, m);
    };
    p.calls = [];
    const probe = p.go();
    await Promise.resolve();
    const concurrent = await p.go();
    expect(concurrent.meta?.note).toBe("breaker_open");
    release();
    const pr = await probe;
    expect(pr.meta?.note).toBe("breaker_probe");
    expect(slow.primary).toBe("ok");
    // نجح الـprobe ⟵ أُغلق القاطع
    p.calls = [];
    (p as unknown as { once: unknown }).once = orig;
    await p.go();
    expect(p.calls[0]).toBe("primary");
    expect(breakerFor("primary")).toMatchObject({ timeouts: 0, openUntil: 0, probing: false });
  });

  it("فشل الـprobe (مهلة) ⟵ يُعاد فتحه 5 دقائق أخرى", async () => {
    const p = new Scripted();
    p.behave.primary = "timeout";
    for (let i = 0; i < BREAKER_THRESHOLD; i++) await p.go();
    clock += BREAKER_OPEN_MS + 1;
    const probe = await p.go();
    expect(probe.meta?.note).toBe("breaker_probe");
    expect(probe.meta?.attempts.map((a) => a.model)).toEqual(["primary", "fallback"]);
    p.calls = [];
    clock += BREAKER_OPEN_MS - 1000;
    expect((await p.go()).meta?.note).toBe("breaker_open");
    expect(p.calls).toEqual(["fallback"]);
  });

  it("القاطع مفتوح والاحتياطي فشل (400) ⟵ يُجرَّب الأساسي ملاذاً أخيراً", async () => {
    const p = new Scripted();
    p.behave.primary = "timeout";
    for (let i = 0; i < BREAKER_THRESHOLD; i++) await p.go();
    p.behave = { primary: "ok", fallback: "400" };
    p.calls = [];
    const r = await p.go();
    expect(p.calls).toEqual(["fallback", "primary"]);
    expect(r.meta?.attempts.map((a) => `${a.model}:${a.outcome}`)).toEqual(["fallback:error", "primary:ok"]);
  });

  it("أخطاء غير المهلة (503/400) على الأساسي لا تفتح القاطع", async () => {
    const p = new Scripted();
    p.behave = { primary: "503", fallback: "ok" };
    for (let i = 0; i < 5; i++) await p.go();
    p.calls = [];
    p.behave.primary = "ok";
    await p.go();
    expect(p.calls).toEqual(["primary"]);
  });

  it("المحاولة الفاشلة تُسجَّل مع تفاصيل الخطأ (حتى 300 حرف) لا نص الرسالة", async () => {
    const p = new Scripted();
    p.behave = { primary: "timeout", fallback: "400" };
    await expect(p.go()).rejects.toBeInstanceOf(LLMError);
    try {
      await p.go();
    } catch (e) {
      const a = (e as LLMError & { attempts: { model: string; detail?: string }[] }).attempts;
      expect(a[1].detail).toContain("invalid argument");
    }
  });
});
