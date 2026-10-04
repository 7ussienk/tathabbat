import { describe, expect, it } from "vitest";
import { containsNormalized, extractLiteral, lightStem, normalizeArabic, normalizeWithMap } from "../lib/arabic/normalize";

describe("normalizeArabic", () => {
  it("يزيل التشكيل والتطويل ويوحّد الألف والياء والتاء المربوطة", () => {
    expect(normalizeArabic("اللَّهُ أَكْبَرُ")).toBe("الله اكبر");
    expect(normalizeArabic("إِلى آمنة ـــ")).toBe("الي امنه");
    expect(normalizeArabic("الجنّة تحت أقدام الأمّهات")).toBe("الجنه تحت اقدام الامهات");
  });
  it("يزيل الترقيم ويطوي الفراغ ويحوّل الأرقام الهندية", () => {
    expect(normalizeArabic("١٢٥ - حديث:  اطلبوا،  العلم!")).toBe("125 حديث اطلبوا العلم");
  });
  it("يحذف رموز الصلاة والترضي دون توسيعها إلى كلمات", () => {
    expect(normalizeArabic("قال ﷺ: خيركم ﵁")).toBe("قال خيركم");
    expect(normalizeArabic("﷽")).toBe("");
  });
  it("لا يغيّر ما كان مطبَّعاً أصلاً (idempotent)", () => {
    const s = "من كان يؤمن بالله واليوم الاخر فليقل خيرا او ليصمت";
    expect(normalizeArabic(normalizeArabic(s))).toBe(normalizeArabic(s));
  });
});

describe("containsNormalized / extractLiteral", () => {
  const original = "٣ - حديث: آل محمد كل تقيٍّ، ثم قرأ ﴿إن أولياؤه إلا المتقون﴾ (ﷺ) وفي الدلائل.";
  it("المطابقة بعد التطبيع", () => {
    expect(containsNormalized(original, "كل تقي ثم قرا")).toBe(true);
    expect(containsNormalized(original, "كل فاسق")).toBe(false);
    expect(containsNormalized(original, "")).toBe(false);
  });
  it("يستخرج المقطع الحرفي من الأصل بتشكيله", () => {
    expect(extractLiteral(original, "كل تقي ثم")).toBe("كل تقيٍّ، ثم");
    expect(extractLiteral(original, "ليس موجودا")).toBeNull();
  });
  it("الخريطة تطابق طول النص المُطبَّع", () => {
    const n = normalizeWithMap("أَبْ  جـد");
    expect(n.text).toBe("اب جد");
    expect(n.map).toHaveLength(n.text.length);
  });
});

describe("lightStem", () => {
  it("يزيل سوابق التعريف الشائعة بحذر", () => {
    expect(lightStem("الجنه")).toBe("جنه");
    expect(lightStem("والعلم")).toBe("علم");
    expect(lightStem("الم")).toBe("الم");
    expect(lightStem("لله")).toBe("لله");
  });
});
