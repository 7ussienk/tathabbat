import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GeminiProvider } from "../lib/llm/gemini";
import { LLMError } from "../lib/llm/provider";

const schema = z.object({ ok: z.boolean() });
const req = { label: "judge", system: "s", input: "i", schema };
const usage = { input_tokens: 1, output_tokens: 1, thought_tokens: 0 };

/** يستبدل النداء الفعلي (once) بسلوك مبرمج لكل نموذج: يختبر السياسة بلا شبكة. */
function provider(behaviour: Record<string, () => Promise<unknown>>, fallback: string | null = "fb-model") {
  const p = new GeminiProvider({ apiKey: "test", model: "main-model", fallbackModel: fallback ?? undefined, firstTimeoutMs: 8000, fallbackTimeoutMs: 10000 });
  const calls: { model: string; timeout: number }[] = [];
  (p as unknown as { once: (r: unknown, model: string, t: number) => Promise<unknown> }).once = async (_r, model, t) => {
    calls.push({ model, timeout: t });
    return behaviour[model]();
  };
  return { p, calls };
}

describe("GeminiProvider: المحاولة الأولى ثم الاحتياطي (لا إعادة على النموذج نفسه)", () => {
  it("نجاح الأولى: لا استدعاء احتياطي، والمهلة الأولى 8ث", async () => {
    const { p, calls } = provider({ "main-model": async () => ({ data: { ok: true }, usage }) });
    const r = await p.generateJson(req);
    expect(calls).toEqual([{ model: "main-model", timeout: 8000 }]);
    expect(r.meta?.attempts.map((a) => a.outcome)).toEqual(["ok"]);
  });

  it("مهلة الأولى ⟵ إعادة فورية على الاحتياطي (مهلته 10ث) وتُسجَّل المحاولتان", async () => {
    const { p, calls } = provider({
      "main-model": async () => {
        throw new LLMError("timeout", "timeout");
      },
      "fb-model": async () => ({ data: { ok: true }, usage }),
    });
    const r = await p.generateJson(req);
    expect(calls).toEqual([
      { model: "main-model", timeout: 8000 },
      { model: "fb-model", timeout: 10000 },
    ]);
    expect(r.meta?.attempts.map((a) => `${a.model}:${a.outcome}`)).toEqual(["main-model:timeout", "fb-model:ok"]);
  });

  it("خطأ عابر (503) أو مخرجات غير مطابقة ⟵ الاحتياطي", async () => {
    for (const first of [new Error("503 UNAVAILABLE"), new LLMError("bad schema", "invalid_output")]) {
      const { p, calls } = provider({
        "main-model": async () => {
          throw first;
        },
        "fb-model": async () => ({ data: { ok: true }, usage }),
      });
      await p.generateJson(req);
      expect(calls.map((c) => c.model)).toEqual(["main-model", "fb-model"]);
    }
  });

  it("فشل الاثنين ⟵ يُرمى خطأ يحمل أثر المحاولتين (للتسجيل) دون محاولة ثالثة", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { p, calls } = provider({
      "main-model": async () => {
        throw new LLMError("timeout", "timeout");
      },
      "fb-model": async () => {
        throw new LLMError("timeout", "timeout");
      },
    });
    await expect(p.generateJson(req)).rejects.toMatchObject({ kind: "timeout", attempts: [{ model: "main-model" }, { model: "fb-model" }] });
    expect(calls).toHaveLength(2);
    // السجل التقني لا يحوي نص الطلب
    expect(JSON.stringify(warn.mock.calls)).not.toContain('"input"');
    warn.mockRestore();
  });

  it("بلا نموذج احتياطي مضبوط: محاولة واحدة فقط", async () => {
    const { p, calls } = provider(
      {
        "main-model": async () => {
          throw new LLMError("timeout", "timeout");
        },
      },
      null,
    );
    await expect(p.generateJson(req)).rejects.toBeInstanceOf(LLMError);
    expect(calls).toHaveLength(1);
  });

  it("خطأ دائم في الطلب (400) لا يُعاد على الاحتياطي", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { p, calls } = provider({
      "main-model": async () => {
        throw new Error("400 INVALID_ARGUMENT");
      },
      "fb-model": async () => ({ data: { ok: true }, usage }),
    });
    await expect(p.generateJson(req)).rejects.toBeInstanceOf(LLMError);
    expect(calls.map((c) => c.model)).toEqual(["main-model"]);
    warn.mockRestore();
  });
});
