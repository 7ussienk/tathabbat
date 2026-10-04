import { describe, expect, it } from "vitest";
import type { BookEntry } from "../lib/retrieval/chunk-maqasid";
import { linkStubs } from "../lib/retrieval/stubs";

// بيانات وهمية صريحة (القاعدة 9)
const e = (number: number, text: string): BookEntry => ({
  id: `test-book#${number}`,
  source_id: "test-book",
  number,
  location: `1/${number} رقم ${number}`,
  vol: "1",
  page_start: number,
  page_end: number,
  page_id_start: number + 1,
  text,
  truncated: false,
});

describe("linkStubs: ربط مداخل الإحالة بأهدافها", () => {
  const entries = [
    e(1, "حديث: TEST_ALIAS_ONE عبارة وهمية، في: TEST_TARGET_ONE."),
    e(2, "حديث: TEST_TARGET_ONE بداية المدخل الهدف ثم نص وهمي طويل يحمل حكماً وهمياً TEST_VERDICT_001 ويستمر بما يكفي ليتجاوز طول الإحالة بكثير لأن الإحالة قصيرة جداً بطبيعتها وهذا ليس كذلك أبداً أبداً."),
    e(3, "حديث: TEST_AMBIG_X الأول وهمي، في: TEST_SHARED."),
    e(4, "حديث: TEST_SHARED الهدف الأول نص وهمي كافٍ ليكون مدخلاً كاملاً وليس إحالة لأنه أطول من حد الإحالة المعتمد في الكود بوضوح تام ولا لبس فيه إطلاقاً."),
    e(5, "حديث: TEST_SHARED الهدف الثاني نص وهمي كافٍ ليكون مدخلاً كاملاً وليس إحالة لأنه أطول من حد الإحالة المعتمد في الكود بوضوح تام ولا لبس فيه إطلاقاً."),
    e(6, "حديث: TEST_NONE وهمي، في: TEST_MISSING_TARGET."),
  ];
  const r = linkStubs(entries);
  const by = (n: number) => r.entries.find((x) => x.number === n)!;

  it("يربط الإحالة بهدفها الوحيد ويحفظ نص الإحالة حرفياً على الهدف", () => {
    expect(by(1).ref_to).toBe(2);
    expect(by(2).see_also).toEqual([{ number: 1, text: entries[0].text, alias: "TEST_ALIAS_ONE عبارة وهمية" }]);
  });

  it("الغامض (هدفان) والبلا هدف يُتركان دون ربط ويُحصيان", () => {
    expect(by(3).ref_to).toBeUndefined();
    expect(by(6).ref_to).toBeUndefined();
    expect(r.stats).toEqual({ stubs: 3, linked: 1, ambiguous: 1, unresolved: 1 });
  });

  it("لا يغيّر نص أي مدخل", () => {
    r.entries.forEach((x, i) => expect(x.text).toBe(entries[i].text));
  });
});
