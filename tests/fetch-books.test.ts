import { describe, expect, it } from "vitest";
import { validateBookShape } from "../scripts/fetch-books";

const page = (n: number) => ({ text: "نص", vol: "1", page: n });

describe("validateBookShape", () => {
  it("يقبل الشكل السليم ويعيد عدد الصفحات", () => {
    expect(validateBookShape({ pages: [page(1), page(2)] }, "test-book", 999)).toBe(2);
  });
  it("يرفض غياب pages", () => {
    expect(() => validateBookShape({ nope: [] }, "test-book", 999)).toThrow(/pages/);
  });
  it("يرفض صفحة بلا text أو page", () => {
    expect(() => validateBookShape({ pages: [{ text: 5, page: 1 }] }, "test-book", 999)).toThrow(/الصفحة 0/);
  });
  it("يفرض عدد صفحات المقاصد الحسنة (525)", () => {
    const pages = Array.from({ length: 524 }, (_, i) => page(i));
    expect(() => validateBookShape({ pages }, "maqasid-sakhawi", 1263)).toThrow(/525/);
  });
});
