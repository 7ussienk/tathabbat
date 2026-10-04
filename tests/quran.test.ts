import { describe, expect, it } from "vitest";
import { containsNormalized } from "../lib/arabic/normalize";
import { loadSuras, verifyQuran } from "../lib/quran/quran";

describe("verifyQuran (ملف Tanzil المحلي)", () => {
  it("يحمّل 6236 آية", () => {
    const suras = loadSuras();
    expect(suras).toHaveLength(114);
    expect(suras.reduce((a, s) => a + s.ayat.length, 0)).toBe(6236);
  });

  it("يتحقق من آية كاملة وجزء من آية وآيتين متتاليتين", () => {
    expect(verifyQuran("ومن يتق الله يجعل له مخرجا ويرزقه من حيث لا يحتسب")).toMatchObject({ kind: "verified", location: "65:2-3" });
    expect(verifyQuran("ألا بذكر الله تطمئن القلوب ❤️")).toMatchObject({ kind: "verified", location: "13:28" });
    expect(verifyQuran("قال تعالى: فإن مع العسر يسرا، إن مع العسر يسرا")).toMatchObject({ kind: "verified", location: "94:5-6" });
  });

  it("يتحمل فرق الإملاء (العالمين، الصلاة) ولا يتأثر بالتشكيل", () => {
    expect(verifyQuran("الحمد لله رب العالمين")).toMatchObject({ kind: "verified", location: "1:2" });
    expect(verifyQuran("وأقيموا الصلاة وآتوا الزكاة")).toMatchObject({ kind: "verified" });
  });

  it("يكشف التحريف بكلمة واحدة ويعيد النص الصحيح من الملف", () => {
    const r = verifyQuran("قال تعالى: لا يكلف الله نفسا إلا طاقتها");
    expect(r.kind).toBe("misquoted");
    if (r.kind === "misquoted") {
      expect(r.location).toBe("2:286");
      expect(containsNormalized(r.text, "إلا وسعها")).toBe(true);
    }
    expect(verifyQuran("إن بعد العسر يسرا")).toMatchObject({ kind: "misquoted", location: "94:6" });
    expect(verifyQuran("ولا تهنوا ولا تحزنوا وأنتم الأعلون إن كنتم صادقين")).toMatchObject({ kind: "misquoted", location: "3:139" });
  });

  it("لا يخلط نصاً غير قرآني ولا يحكم على نص قصير", () => {
    expect(verifyQuran("اطلبوا العلم ولو بالصين").kind).toBe("none");
    expect(verifyQuran("نص عادي لا علاقة له بالقرآن أبداً مطلقاً").kind).toBe("none");
    expect(verifyQuran("الحمد لله").kind).toBe("none");
  });

  it("لا يضم البسملة إلى الآية الأولى من السور", () => {
    const r = verifyQuran("ذلك الكتاب لا ريب فيه هدى للمتقين");
    expect(r.kind).toBe("verified");
    if (r.kind === "verified") expect(r.text.startsWith("بِسْمِ")).toBe(false);
  });
});
