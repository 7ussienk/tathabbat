import { describe, expect, it } from "vitest";
import { chunkEntries, ChunkError, type BookFile, type ChunkSpec } from "../lib/retrieval/chunk-maqasid";

// بيانات وهمية صريحة (القاعدة 9): لا نصوص دينية تبدو حقيقية
const spec: ChunkSpec = { sourceId: "test-book", lastNumber: 5, missingNumbers: [4], endMarker: "TEST_END_MARKER" };
const page = (n: number, text: string) => ({ text, vol: "1", page: n });
const book = (pages: ReturnType<typeof page>[]): BookFile => ({ pages });
const sep = "\n_________\n(^١) TEST_FOOTNOTE حاشية وهمية";

describe("chunkEntries (مواصفة وهمية)", () => {
  const fixture = book([
    page(1, "مقدمة وهمية TEST_INTRO"),
    page(2, `١ - حديث: TEST_HADITH_001 بداية\n\n٢ - حديث (^١): TEST_HADITH_002 صيغة الحاشية${sep}`),
    page(3, `تتمة TEST_HADITH_002 على صفحة ثانية (^٢)\n\n٣ - حديث: TEST_HADITH_003${sep}`),
    page(
      4,
      `<span data-type="title" id="t1" data-level="1">عنوان قسم TEST_TITLE</span>\n\n٥ - حديث: TEST_HADITH_005 الأخير\nTEST_END_MARKER خاتمة وهمية لا تدخل`,
    ),
  ]);
  const entries = chunkEntries(fixture, spec);

  it("يعطي المداخل المتوقعة ويقفز الرقم المفقود", () => {
    expect(entries.map((e) => e.number)).toEqual([1, 2, 3, 5]);
    expect(entries[0].id).toBe("test-book#1");
  });

  it("يلتقط صيغة «حديث (^١):» ويحذف علامات الحواشي من النص", () => {
    expect(entries[1].text.startsWith("حديث: TEST_HADITH_002")).toBe(true);
    expect(entries.every((e) => !e.text.includes("(^"))).toBe(true);
  });

  it("يهمل الحاشية وعناوين الأقسام والخاتمة", () => {
    const all = entries.map((e) => e.text).join(" ");
    expect(all).not.toContain("TEST_FOOTNOTE");
    expect(all).not.toContain("TEST_TITLE");
    expect(all).not.toContain("خاتمة وهمية");
    expect(entries[3].text).toBe("حديث: TEST_HADITH_005 الأخير");
  });

  it("يجمع المدخل المتصل عبر صفحتين ويسجّل الموضع والمعرّف", () => {
    expect(entries[1].text).toContain("تتمة TEST_HADITH_002");
    expect(entries[1].location).toBe("1/2-3 رقم 2");
    expect(entries[1].page_id_start).toBe(2); // فهرس الصفحة 1 + 1
    expect(entries[0].location).toBe("1/2 رقم 1");
    expect(entries[1].truncated).toBe(false);
  });

  it("يحدّ المدخل بأربع صفحات ويوسمه مقطوعاً", () => {
    const long = book([
      page(1, "١ - حديث: TEST_LONG"),
      page(2, "ب"),
      page(3, "ج"),
      page(4, "د"),
      page(5, "TEST_BEYOND_LIMIT"),
      page(6, "٢ - حديث: TEST_NEXT\nTEST_END"),
    ]);
    const e = chunkEntries(long, { ...spec, lastNumber: 2, missingNumbers: [], endMarker: "TEST_END" });
    expect(e[0].truncated).toBe(true);
    expect(e[0].text).not.toContain("TEST_BEYOND_LIMIT");
    expect(e[0].page_end).toBe(4);
  });

  it("يفشل بوضوح إن اختل العدد أو غابت الخاتمة", () => {
    expect(() => chunkEntries(book([page(1, "١ - حديث: TEST")]), spec)).toThrow(ChunkError);
    const noMarker = book([page(1, "١ - حديث: a\n\n٢ - حديث: b\n\n٣ - حديث: c\n\n٥ - حديث: d")]);
    expect(() => chunkEntries(noMarker, spec)).toThrow(/خاتمة/);
  });
});
