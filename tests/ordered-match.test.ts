import { describe, expect, it } from "vitest";
import { bagCoverage, claimWords, matnCharStart, orderedMatch, parseWords } from "../lib/pipeline/ordered-match";

// نصوص تجريبية صريحة (القاعدة 9): إسناد وهمي ومتن غير ديني
const ENTRY = "حدثنا TEST_A عن TEST_B عن أبي TEST_C عن النبي ﷺ قال: (لا يدخل أحدكم الغرفة حتى يطرق الباب، وإنما الأدب للجميع). رواه TEST_D";
const m = (claim: string, text = ENTRY) => orderedMatch(claim, text, { matnOnly: true }).kind;

describe("orderedMatch: المطابقة التامة المرتّبة", () => {
  it("اللفظ نفسه كاملاً ⟵ exact، ومع تشكيل وهمزات وترقيم", () => {
    expect(m("لا يدخل أحدكم الغرفة حتى يطرق الباب")).toBe("exact");
    expect(m("لَا يَدْخُلُ أَحَدُكُمُ الْغُرْفَةَ حَتَّى يَطْرُقَ الْبَابَ")).toBe("exact");
    expect(m("وإنما الأدب للجميع")).toBe("exact");
  });

  it("مقطع مبتور من أول الجملة أو آخرها ليس exact", () => {
    expect(m("لا يدخل أحدكم الغرفة")).not.toBe("exact");
    expect(m("يدخل أحدكم الغرفة حتى يطرق الباب")).not.toBe("exact");
  });

  it("حذف «لا» لا يمرّ ويُصنَّف قريباً (الحالة الحرجة)", () => {
    expect(m("يدخل أحدكم الغرفة حتى يطرق الباب")).toBe("near");
  });

  it("تبديل كلمتين أو استبدال أو إضافة كلمة ⟵ ليس exact", () => {
    for (const altered of [
      "لا يدخل أحدكم حتى الغرفة يطرق الباب",
      "لا يدخل أحدكم الغرفة حتى يفتح الباب",
      "لا يدخل أحدكم الغرفة أبدا حتى يطرق الباب",
    ]) expect(m(altered)).not.toBe("exact");
  });

  it("إعادة الترتيب مع تبديل السوابق قريبة (wording_differs) لا بعيدة", () => {
    const e = "قال: (إنما الأعمال بالنيات)";
    expect(orderedMatch("انما النيات بالاعمال", e).kind).toBe("near");
    expect(orderedMatch("إنما الأعمال بالنيات", e).kind).toBe("exact");
    expect(bagCoverage(claimWords("انما النيات بالاعمال"), claimWords("إنما الأعمال بالنيات"))).toBe(1);
  });

  it("نافذة المتن: عبارات الإسناد لا تطابق تاماً", () => {
    expect(m("حدثنا TEST_A عن TEST_B")).not.toBe("exact");
  });

  it("عبارة التقديم «قال رسول الله ﷺ:» تُهمل من الادعاء", () => {
    expect(claimWords("قال رسول الله ﷺ: لا يدخل أحدكم الغرفة")).toEqual(["لا", "يدخل", "احدكم", "الغرفه"]);
    expect(m("قال رسول الله ﷺ: لا يدخل أحدكم الغرفة حتى يطرق الباب")).toBe("exact");
  });

  it("نص لا علاقة له ⟵ far", () => {
    expect(m("كلام آخر تماما لا يتصل بشيء")).toBe("far");
  });
});

describe("parseWords / matnCharStart", () => {
  it("بداية المتن بعد أول ﷺ، وتبقى «لا» ضمن الكلمات", () => {
    const p = parseWords(ENTRY);
    expect(p.words.map((w) => w.w)).toContain("لا");
    expect(p.words[p.matnFrom].w).toBe("قال");
    expect(ENTRY.slice(matnCharStart(ENTRY)!).startsWith("قال")).toBe(true);
  });

  it("بلا ﷺ يعتمد «رسول الله»، وبلا إسناد يعيد null", () => {
    expect(matnCharStart("حدثنا فلان عن رسول الله قال لا تفعلوا")).not.toBeNull();
    expect(matnCharStart("نص بلا إسناد ولا ذكر لأحد")).toBeNull();
  });
});
