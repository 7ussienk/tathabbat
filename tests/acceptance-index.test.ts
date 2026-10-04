/**
 * اختبار القبول للفهرس (القاعدة 27 / القرار 79): يُسترجع W001 وW002 وW004 وW005 من مداخل المقاصد،
 * وتُسترجع مداخل data/curated الـ48 من الفهرس. يتطلب `npm run fetch-books && npm run build-index`
 * (يُتخطى عند غياب data/index لأن متون الكتب خارج Git).
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { containsNormalized } from "../lib/arabic/normalize";
import { loadIndex, search } from "../lib/retrieval/text-index";
import type { BookEntry } from "../lib/retrieval/chunk-maqasid";
import type { CuratedEntry } from "../lib/schemas/curated";

const ready = existsSync("data/index/text-index.json") && existsSync("data/index/store.json");

describe.skipIf(!ready)("اختبار القبول للفهرس المحلي", () => {
  const index = ready ? loadIndex(readFileSync("data/index/text-index.json", "utf8")) : null!;
  const store = ready
    ? (JSON.parse(readFileSync("data/index/store.json", "utf8")) as { entries: BookEntry[]; curated: CuratedEntry[] })
    : null!;
  const byId = new Map((ready ? store.entries : []).map((e) => [e.id, e]));

  const maqasidIds = (c: CuratedEntry) =>
    c.sources
      .filter((s) => s.source_id === "maqasid-sakhawi")
      .map((s) => /رقم (\d+)/.exec(s.location)?.[1])
      .filter((n): n is string => !!n)
      .map((n) => `maqasid-sakhawi#${n}`);

  const of = (id: string) => store.entries.filter((e) => e.source_id === id);

  it("المقاصد: 1355 مدخلاً وآخر رقم 1356 ولا قطع بحد الصفحات", () => {
    const m = of("maqasid-sakhawi");
    expect(m).toHaveLength(1355);
    expect(m.at(-1)!.number).toBe(1356);
    expect(m.some((e) => e.truncated)).toBe(false);
  });

  it("الصحيحان: البخاري 7125 مدخلاً (ترقيم البغا 1..7124) ومسلم 3167 مدخلاً بالأرقام الحقيقية ≤ 3033", () => {
    const b = of("sahih-bukhari");
    const m = of("sahih-muslim");
    expect(b).toHaveLength(7125);
    expect(m).toHaveLength(3167);
    expect(Math.max(...b.map((e) => e.number))).toBe(7124);
    expect(Math.max(...m.map((e) => e.number))).toBe(3033);
    // متن فقط: لا حواشي ولا عناوين أبواب ولا أسطر إحالة المحقق
    expect([...b, ...m].filter((e) => /<hr>|<span||^\[[^\]]+\]\.?$/m.test(e.text))).toEqual([]);
  });

  it("مراسي الصحيحين: مداخل curated الصحيحة A001–A012 موجودة بأرقامها وصفحة بدايتها ونصها الحرفي داخل المدخل", () => {
    const bad: string[] = [];
    let n = 0;
    for (const c of store.curated) {
      for (const s of c.sources) {
        if (!/^sahih-/.test(s.source_id)) continue;
        n++;
        const num = /رقم (\d+)/.exec(s.location)?.[1];
        const e = byId.get(`${s.source_id}#${num}`);
        if (!e) bad.push(`${c.id}: لا مدخل`);
        else {
          if (e.location.split(" ")[0].split("-")[0] !== s.location.split(" ")[0].split("-")[0] && !e.location.startsWith(s.location.split(" ")[0])) bad.push(`${c.id}: الموضع ${e.location} ≠ ${s.location}`);
          if (s.quoted_text && !containsNormalized(e.text, s.quoted_text)) bad.push(`${c.id}: النص ∉ المدخل`);
        }
      }
    }
    expect(n).toBe(12);
    expect(bad).toEqual([]);
  });

  it("W001 وW002 وW004 وW005 تُسترجع من مداخل المقاصد ضمن أفضل 10", () => {
    for (const id of ["W001", "W002", "W004", "W005"]) {
      const c = store.curated.find((x) => x.id === id)!;
      const want = maqasidIds(c);
      expect(want.length, `${id} بلا مدخل مقاصد`).toBeGreaterThan(0);
      const hits = search(index, c.claim_text, 10, (r) => r.kind === "book").map((h) => h.id);
      expect(
        want.some((w) => hits.includes(w)),
        `${id}: ${want} ∉ ${hits}`,
      ).toBe(true);
    }
  });

  it("مداخل curated الـ48 تُسترجع من الفهرس ضمن أفضل 10", () => {
    expect(store.curated).toHaveLength(48);
    const misses = store.curated
      .filter((c) => !search(index, c.claim_text, 10).some((h) => h.id === `curated#${c.id}`))
      .map((c) => c.id);
    expect(misses).toEqual([]);
  });

  it("كل مدخل مقاصد في curated موجود، ونص حكم الإمام جزء حرفي (بعد التطبيع) من المدخل المقطَّع", () => {
    const bad: string[] = [];
    for (const c of store.curated) {
      for (const s of c.sources) {
        if (s.source_id !== "maqasid-sakhawi") continue;
        const n = /رقم (\d+)/.exec(s.location)?.[1];
        if (!n) continue;
        const e = byId.get(`maqasid-sakhawi#${n}`);
        if (!e) bad.push(`${c.id}: لا مدخل ${n}`);
        else if (s.grading_quote && !containsNormalized(e.text, s.grading_quote)) bad.push(`${c.id}: grading_quote ∉ المدخل ${n}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
