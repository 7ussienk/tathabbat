import type { RateLimitStore } from "@/lib/ratelimit/store";

const MAX_KEYS = 5000;

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  async hit(key: string, windowMs: number, now = Date.now()): Promise<number> {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > MAX_KEYS) {
      // تنظيف المفاتيح القديمة لمنع نمو الذاكرة
      for (const [k, v] of this.hits) if (!v.length || now - v[v.length - 1] >= windowMs) this.hits.delete(k);
    }
    return arr.length;
  }
}

const g = globalThis as unknown as { __tathabbatRL?: MemoryRateLimitStore };
export const sharedMemoryStore = (): MemoryRateLimitStore => (g.__tathabbatRL ??= new MemoryRateLimitStore());
