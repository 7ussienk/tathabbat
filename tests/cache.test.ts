/** كاش نداءات النموذج وحد الإنفاق (قاعدة الميزانية، CLAUDE.md §13). مزوّد وهمي بلا شبكة. */
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BudgetExceededError, CachingProvider } from "../lib/llm/cache";
import { MockProvider } from "../lib/llm/mock";

const schema = z.object({ v: z.string() });
const mk = (maxUsd = 1, price = 1, run = { id: "curated:1" }, salt = "m|p.4|l.3") => {
  const inner = new MockProvider({ extract: (req) => ({ v: `r:${String(req.input)}` }) });
  const dir = mkdtempSync(join(tmpdir(), "tath-cache-"));
  const make = (s = salt, r = run) =>
    new CachingProvider(inner, { dir, salt: s, maxUsd, priceInPerM: price, priceOutPerM: price, getRun: () => r.id });
  return { inner, dir, make, run };
};
const call = (c: CachingProvider, input: string) => c.generateJson({ label: "extract", system: "s", input, schema });

describe("CachingProvider", () => {
  it("النداء نفسه لا يُرسل مرتين، والنتيجة متطابقة", async () => {
    const { inner, make } = mk();
    const c = make();
    const a = await call(c, "x");
    const b = await call(c, "x");
    expect(b.data).toEqual(a.data);
    expect(inner.calls).toHaveLength(1);
    expect(c.stats).toMatchObject({ hits: 1, misses: 1 });
  });

  it("إعادة تشغيل بعملية جديدة (كاش على القرص) تصيب الكاش بلا نداءات", async () => {
    const { inner, make } = mk();
    await call(make(), "x");
    const again = make();
    await call(again, "x");
    expect(inner.calls).toHaveLength(1);
    expect(again.stats).toMatchObject({ hits: 1, misses: 0, spentUsd: 0 });
  });

  it("رقم التشغيل ونسخة البرومت/المعجم ونص المدخل داخل المفتاح", async () => {
    const { inner, make, run } = mk();
    const c = make();
    await call(c, "x");
    run.id = "curated:2";
    await call(c, "x"); // تشغيل آخر ⟵ عيّنة مستقلة
    await call(c, "y"); // مدخل آخر
    await call(make("m|p.5|l.3"), "x"); // نسخة برومت أخرى
    expect(inner.calls).toHaveLength(4);
  });

  it("حد الإنفاق: يتوقف النداء التالي عند البلوغ، والإصابات لا تُحتسب", async () => {
    // السعر 1$ لكل توكن ⟵ كل نداء وهمي (100+20 توكن) يتجاوز أي حد صغير فوراً
    const { make } = mk(0.5, 1_000_000);
    const c = make();
    await call(c, "x"); // الأول يمر (المصروف 0 قبله)
    expect(c.stats.spentUsd).toBeGreaterThanOrEqual(0.5);
    await expect(call(c, "y")).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(call(c, "x")).resolves.toBeTruthy(); // إصابة كاش: لا تُمنع ولا تُحتسب
  });

  it("المحتوى المخزَّن بيانات الاستجابة فقط (لا system ولا مدخل)", async () => {
    const { dir, make } = mk();
    await call(make(), "نص حساس تجريبي");
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{64}\.json$/);
  });
});
