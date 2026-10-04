/**
 * كاش لنداءات النموذج في مشغّل التقييم (قاعدة الميزانية، CLAUDE.md §13): النداء نفسه لا يُرسل مرتين.
 * المفتاح = hash(نسخة البرومت + نسخة المعجم + النموذج + وسم النداء + system + المدخل [ومنه قائمة المرشحين] + رقم التشغيل).
 * رقم التشغيل داخل المفتاح ليبقى قياس الثبات بين التشغيلات الثلاثة عيّنات مستقلة في أول تقييم؛ أما إعادة تقييم تعديل برمجي في التسجيل فقط
 * فتصيب الكاش كله بلا أي نداء. `maxUsd` يوقف التشغيل عند بلوغ ما صُرف فعلاً (الإصابات لا تُحتسب).
 * يُكتب الكاش في مجلد خارج Git (eval/cache/) ولا يُستخدم في الإنتاج.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CallMeta, GenerateJsonRequest, LLMProvider, LLMResult, LLMUsage } from "@/lib/llm/provider";

export class BudgetExceededError extends Error {
  constructor(readonly spentUsd: number, readonly maxUsd: number) {
    super(`بلغ المصروف الفعلي ${spentUsd.toFixed(3)}$ حد EVAL_MAX_USD (${maxUsd}$)`);
  }
}

export type CacheOptions = {
  dir: string;
  /** ما يميّز النسخة: النموذج + نسخة البرومت + نسخة المعجم */
  salt: string;
  maxUsd: number;
  priceInPerM: number;
  priceOutPerM: number;
  /** رقم التشغيل الحالي (يتغير بين التشغيلات) */
  getRun: () => string;
};

type Entry = { data: unknown; usage: LLMUsage; meta?: CallMeta };

export class CachingProvider implements LLMProvider {
  stats = { hits: 0, misses: 0, spentUsd: 0 };
  constructor(private readonly inner: LLMProvider, private readonly o: CacheOptions) {
    mkdirSync(o.dir, { recursive: true });
  }

  key<T>(req: GenerateJsonRequest<T>): string {
    return createHash("sha256")
      .update([this.o.salt, req.label, req.thinking ?? "", req.system, JSON.stringify(req.input), this.o.getRun()].join("\u0000"))
      .digest("hex");
  }

  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<LLMResult<T>> {
    const file = join(this.o.dir, `${this.key(req)}.json`);
    if (existsSync(file)) {
      const e = JSON.parse(readFileSync(file, "utf8")) as Entry;
      this.stats.hits++;
      // meta المخزَّنة تحفظ النموذج الذي خدم النداء فعلاً (للتقرير)؛ والمدخلات القديمة بلا meta تُعلَّم "cache"
      return { data: req.schema.parse(e.data), usage: e.usage, meta: e.meta ?? { label: req.label, attempts: [{ model: "cache", ms: 0, outcome: "ok" }] } };
    }
    if (this.stats.spentUsd >= this.o.maxUsd) throw new BudgetExceededError(this.stats.spentUsd, this.o.maxUsd);
    const r = await this.inner.generateJson(req);
    this.stats.misses++;
    this.stats.spentUsd += (r.usage.input_tokens * this.o.priceInPerM + r.usage.output_tokens * this.o.priceOutPerM) / 1e6;
    writeFileSync(file, JSON.stringify({ data: r.data, usage: r.usage, meta: r.meta } satisfies Entry));
    return r;
  }
}
