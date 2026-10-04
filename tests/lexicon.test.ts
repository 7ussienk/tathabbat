import { describe, expect, it } from "vitest";
import { sanitize } from "../lib/log";
import { classify, decideVerdict } from "../lib/pipeline/verdict-lexicon";

describe("verdict-lexicon (معجم ثابت)", () => {
  it("موضوع/باطل ← fabricated، لا أصل له/لم أقف عليه ← no_basis، ضعيف/منكر/لا يصح ← weak", () => {
    expect(decideVerdict("وهو موضوع", "fabricated").verdict).toBe("fabricated");
    expect(decideVerdict("قال ابن حبان: إنه باطل", "fabricated").verdict).toBe("fabricated");
    expect(decideVerdict("لا أصل له كما قاله أحمد", "no_basis_per_scholar").verdict).toBe("no_basis_per_scholar");
    expect(decideVerdict("لم أقف عليه", "no_basis_per_scholar").verdict).toBe("no_basis_per_scholar");
    expect(decideVerdict("وسنده ضعيف", "weak").verdict).toBe("weak");
    expect(decideVerdict("هذا حديث منكر", "weak").verdict).toBe("weak");
    expect(decideVerdict("لا يصح في الباب شيء", "weak").verdict).toBe("weak");
  });

  it("تعارض التصنيف المقترح مع لفظ الجملة ⇒ disputed", () => {
    expect(decideVerdict("لا أصل له", "weak").verdict).toBe("disputed");
  });

  it("أكثر من فئة في الجملة ⇒ disputed", () => {
    expect(decideVerdict("ضعيف بل قال ابن حبان باطل لا أصل له", "weak").verdict).toBe("disputed");
  });

  it("لا لفظ في المعجم ⇒ scholar_text_only، ولا authentic آلياً من «صحيح الإسناد»", () => {
    expect(decideVerdict("وسنده صحيح الإسناد ولم يخرجاه", "none").verdict).toBe("scholar_text_only");
    expect(decideVerdict("أخرجه الديلمي في مسنده", "none").verdict).toBe("scholar_text_only");
  });

  it("النفي لا يُعدّ حكماً: «ليس بضعيف» و«غير موضوع»", () => {
    expect(classify("وهو ليس بضعيف").found).toEqual([]);
    expect(classify("هو غير موضوع").found).toEqual([]);
    expect(decideVerdict("وليس بموضوع", "fabricated").verdict).toBe("scholar_text_only");
  });

  it("تُحسب الألفاظ بعد التطبيع (تشكيل، همزة)", () => {
    expect(classify("لَا أَصْلَ لَهُ").found).toEqual(["no_basis_per_scholar"]);
    expect(classify("ضَعِيفٌ").found).toEqual(["weak"]);
  });
});

describe("log allow-list (القاعدة 7 و26)", () => {
  it("يهمل أي حقل خارج القائمة مثل نص الرسالة والادعاء", () => {
    const out = sanitize({ request_id: "r1", status: "ok", text: "نص رسالة", claim_text: "ادعاء", message: "x", duration_ms: 5, verdicts: ["weak"] });
    expect(Object.keys(out).sort()).toEqual(["duration_ms", "request_id", "status", "verdicts"]);
    expect(JSON.stringify(out)).not.toContain("نص رسالة");
    expect(JSON.stringify(out)).not.toContain("ادعاء");
  });
});
