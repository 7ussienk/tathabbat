import { describe, expect, it } from "vitest";
import { sanitize } from "../lib/log";
import { classify, decideVerdict } from "../lib/pipeline/verdict-lexicon";

describe("verdict-lexicon: الأصل (القرار 54)", () => {
  it("موضوع/باطل ← fabricated، لا أصل له/لم أقف عليه ← no_basis، ضعيف/منكر/لا يصح ← weak", () => {
    expect(decideVerdict("وهو موضوع", "fabricated").verdict).toBe("fabricated");
    expect(decideVerdict("قال ابن حبان: إنه باطل", "fabricated").verdict).toBe("fabricated");
    expect(decideVerdict("لا أصل له كما قاله أحمد", "no_basis_per_scholar").verdict).toBe("no_basis_per_scholar");
    expect(decideVerdict("لم أقف عليه", "no_basis_per_scholar").verdict).toBe("no_basis_per_scholar");
    expect(decideVerdict("وسنده ضعيف", "weak").verdict).toBe("weak");
    expect(decideVerdict("هذا حديث منكر", "weak").verdict).toBe("weak");
    expect(decideVerdict("لا يصح في الباب شيء", "weak").verdict).toBe("weak");
  });

  it("«ما علمته/فما علمته» مرادف «لم أقف عليه» ⟵ no_basis_per_scholar بوسم needs_scholar_review (النسخة .3)", () => {
    const a = decideVerdict("فما علمته", "no_basis_per_scholar");
    expect(a.verdict).toBe("no_basis_per_scholar");
    expect(a.needs_scholar_review).toContain("ما علمته");
    expect(decideVerdict("قال السخاوي: وما علمته", "none").verdict).toBe("scholar_text_only");
    expect(classify("كما علمته من شيخي").found).toEqual([]);
  });

  it("لا لفظ في المعجم ⇒ scholar_text_only، ولا authentic آلياً من «صحيح الإسناد»", () => {
    expect(decideVerdict("وسنده صحيح الإسناد ولم يخرجاه", "none").verdict).toBe("scholar_text_only");
    expect(decideVerdict("أخرجه الديلمي في مسنده", "none").verdict).toBe("scholar_text_only");
  });

  it("النفي لا يُعدّ حكماً: «ليس بضعيف» و«غير موضوع» و«وليس بموضوع»", () => {
    expect(classify("وهو ليس بضعيف").found).toEqual([]);
    expect(classify("هو غير موضوع").found).toEqual([]);
    expect(decideVerdict("وليس بموضوع", "fabricated").verdict).toBe("scholar_text_only");
  });

  it("تُحسب الألفاظ بعد التطبيع (تشكيل، همزة)", () => {
    expect(classify("لَا أَصْلَ لَهُ").found).toEqual(["no_basis_per_scholar"]);
    expect(classify("ضَعِيفٌ").found).toEqual(["weak"]);
  });
});

describe("عائلة «لا أصل» اتفاقٌ لا تعارض (قرار 4 أكتوبر، البند أ)", () => {
  it("T088: «موضوع… موضوع، لا أصل له» ← fabricated (أقوى لفظ) لا disputed", () => {
    const s = "قال ابن تيمية: إنه موضوع، ولم يروه أحد من أهل العلم بالحديث، وكذا قال النووي في آخر الحج من شرح المهذب: هو موضوع، لا أصل له";
    const r = decideVerdict(s, "fabricated");
    expect(r.verdict).toBe("fabricated");
    expect(r.found.sort()).toEqual(["fabricated", "no_basis_per_scholar"]);
    // ولو اقترح النموذج no_basis فالجملة من العائلة نفسها: يُختار الأقوى
    expect(decideVerdict(s, "no_basis_per_scholar").verdict).toBe("fabricated");
  });

  it("T036/T085: «باطل لا أصل له» ← fabricated", () => {
    expect(decideVerdict("باطل لا أصل له، وإن أسنده صاحب تاريخ بلخ", "fabricated").verdict).toBe("fabricated");
  });

  it("«كذب» من العائلة (وموسومة needs_scholar_review)", () => {
    const r = decideVerdict("قال أحمد: هذا كذب", "fabricated");
    expect(r.verdict).toBe("fabricated");
    expect(r.needs_scholar_review).toContain("كذب");
  });

  it("«لا أصل له بهذا اللفظ» تُحمَل على لا أصل له (بلا تحويلها إلى باطل)", () => {
    expect(decideVerdict("لا أصل له بهذا اللفظ", "no_basis_per_scholar").verdict).toBe("no_basis_per_scholar");
  });

  it("اقتراح «ضعيف» مع جملة من العائلة ⇒ disputed (لا يُسحب الحكم)", () => {
    expect(decideVerdict("لا أصل له", "weak").verdict).toBe("disputed");
  });

  it("«ضعيف» لا يُدمج مع أي من العائلة: disputed", () => {
    expect(decideVerdict("ضعيف بل قال ابن حبان باطل", "weak").verdict).toBe("disputed");
    expect(decideVerdict("وسنده ضعيف وهو لا أصل له", "fabricated").verdict).toBe("disputed");
  });

  it("«ضعيف» أو العائلة مع لفظ إيجابي: disputed؛ والإيجابي وحده scholar_text_only", () => {
    expect(decideVerdict("قال البيهقي: إسناده ضعيف، وقال العراقي: صحيح", "weak").verdict).toBe("disputed");
    expect(decideVerdict("قال أحمد: هو موضوع، وصححه الحاكم", "fabricated").verdict).toBe("disputed");
    expect(decideVerdict("وبالجملة فحديث عائشة حسن", "none").verdict).toBe("scholar_text_only");
  });

  it("اسم كتاب «في صحيحه» ليس لفظاً إيجابياً", () => {
    expect(classify("رواه مسلم في صحيحه وهو ضعيف").positive).toBe(false);
    expect(decideVerdict("رواه مسلم في صحيحه وهو ضعيف", "weak").verdict).toBe("weak");
  });
});

describe("النسبة لغير النبي ﷺ (قرار 4 أكتوبر، البند ب) — موسومة needs_scholar_review", () => {
  it("«ليس من كلام النبي ﷺ» بلا قائل آخر ← no_basis_per_scholar", () => {
    const r = decideVerdict("قال ابن تيمية: إنه ليس من كلام النبي ﷺ، ولا يعرف له سند صحيح ولا ضعيف", "none");
    expect(r.verdict).toBe("no_basis_per_scholar");
    expect(r.needs_scholar_review).toContain("ليس من كلام النبي");
  });

  it("«لا يعرف مرفوعاً» و«يحكى عن» مع اسم القائل ← misattributed", () => {
    const s = "أنه لا يعرف مرفوعًا، وإنما يحكى عن يحيى بن معاذ الرازي يعني من قوله";
    const r = decideVerdict(s, "none");
    expect(r.verdict).toBe("misattributed");
    expect(r.misattributed_by).toContain("يحيي بن معاذ");
    expect(r.needs_scholar_review.length).toBeGreaterThan(0);
  });

  it("«من قول علي بن أبي طالب» ← misattributed؛ و«ليس من كلام النبي» مع قائل آخر مسمّى ← misattributed لا no_basis", () => {
    expect(decideVerdict("هو من قول علي بن أبي طالب", "none").verdict).toBe("misattributed");
    expect(decideVerdict("ليس من كلام النبي ﷺ بل هو من قول سفيان بن عيينة", "none").verdict).toBe("misattributed");
  });

  it("بلا اسم قائل ← scholar_text_only (لا نسبة مجهولة)", () => {
    expect(decideVerdict("لا يعرف مرفوعا وإنما يحكى عن بعض الصوفية", "none").verdict).toBe("scholar_text_only");
    expect(decideVerdict("هو من قول بعض الناس", "none").verdict).toBe("scholar_text_only");
  });

  it("«ضعيف» مع نسبة لغير النبي ⇒ disputed", () => {
    expect(decideVerdict("وسنده ضعيف، ويحكى عن سفيان بن عيينة", "weak").verdict).toBe("disputed");
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
