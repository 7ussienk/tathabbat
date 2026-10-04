/**
 * قرار 106 (scoring-2026-10-04.3): (1) fallback الذي يعرض لفظ المصدر حين لا يختار النموذج مرشحاً؛ (2) حارسا المستخرِج.
 * النصوص التجريبية وهمية (القاعدة 9) إلا ما يلزم من ألفاظ الصحيحين المفهرسة لاختبار الاسترجاع.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getConfig } from "../lib/config";
import { MockProvider } from "../lib/llm/mock";
import { guardClaims } from "../lib/pipeline/extract-claims";
import { fallbackNear } from "../lib/pipeline/ordered-check";
import { DENSE_MIN_WORDS, NEAR_DENSE_MIN, denseCoverage } from "../lib/pipeline/ordered-match";
import type { Candidate } from "../lib/pipeline/retrieve";
import type { Store } from "../lib/retrieval/store";
import { FALLBACK_NOTE } from "../lib/pipeline/build-claim";
import { VerifyResponseSchema } from "../lib/schemas/claim";
import { verifyMessage } from "../lib/verify-message";

const config = getConfig({ GEMINI_API_KEY: "test", CONFIDENCE_THRESHOLD: "0.75" } as unknown as NodeJS.ProcessEnv);
const ready = existsSync("data/index/text-index.json") && existsSync("data/index/store.json");

type C = { claim_text: string; claim_type: "hadith" | "quran" | "athar" | "scholar_quote" | "dua_or_virtue" | "fatwa_request" | "other"; content_level: "A" | "B" | "C" | "D"; understood_as: string };
const cl = (claim_text: string, claim_type: C["claim_type"] = "hadith"): C => ({ claim_text, claim_type, content_level: "A", understood_as: "x" });

describe("denseCoverage: كلمات متجاورة لا مبعثرة", () => {
  const long = "حدثنا TEST_A عن النبي ﷺ قال: " + Array.from({ length: 60 }, (_, i) => `كلمة${i}`).join(" ");
  it("ثلاث كلمات متجاورة بترتيب مختلف ⟵ تغطية كاملة", () => {
    const text = "حدثنا TEST_A عن النبي ﷺ قال: إنما الأعمال بالنيات وإنما لكل امرئ ما نوى";
    expect(denseCoverage("إنما النيات بالأعمال", text, { matnOnly: true }).cov).toBe(1);
  });
  it("كلمات الادعاء مبعثرة في نص طويل ⟵ لا تغطية كثيفة", () => {
    const scattered = "حدثنا TEST_A عن النبي ﷺ قال: " + ["من", ...Array.from({ length: 20 }, (_, i) => `ش${i}`), "الله", ...Array.from({ length: 20 }, (_, i) => `ص${i}`), "عنه"].join(" ");
    expect(denseCoverage("من الله عنه", scattered, { matnOnly: true }).cov).toBeLessThan(0.8);
    expect(denseCoverage("كلمة3 كلمة4 كلمة5", long, { matnOnly: true }).cov).toBe(1);
  });
  it("أقل من ثلاث كلمات ⟵ صفر (عام جداً)", () => {
    expect(denseCoverage("الدين النصيحة", "قال: الدين النصيحة", {}).cov).toBe(0);
  });
});

describe("شروط الـfallback المحافِظة (طلب صاحب المشروع)", () => {
  const entry = (id: string, text: string) => ({ id, source_id: "sahih-bukhari", text: "حدثنا TEST_A عن النبي ﷺ قال: " + text, number: 1, location: "x", page: 1 });
  const cand = (id: string, text: string) => ({ id, kind: "book", score: 1, entry: entry(id, text) }) as unknown as Candidate;
  const store = { entries: new Map(), curated: new Map() } as unknown as Store;

  it("العتبتان: 3 كلمات بتغطية 100% أو 4 كلمات فأكثر بتغطية ≥ 0.8 (أي 4/4 للأربع)", () => {
    expect(DENSE_MIN_WORDS).toBe(3);
    expect(NEAR_DENSE_MIN).toBe(0.8);
    const e = entry("a", "الف باء جيم دال هاء واو");
    expect(fallbackNear("الف باء جيم", [{ id: "a", kind: "book", score: 1, entry: e } as unknown as Candidate], store)).toHaveLength(1); // 3/3
    expect(fallbackNear("الف باء زاي", [{ id: "a", kind: "book", score: 1, entry: e } as unknown as Candidate], store)).toHaveLength(0); // 2/3 < 100%
    expect(fallbackNear("الف باء جيم زاي", [{ id: "a", kind: "book", score: 1, entry: e } as unknown as Candidate], store)).toHaveLength(0); // 3/4 = 0.75 < 0.8
    expect(fallbackNear("الف باء جيم دال", [{ id: "a", kind: "book", score: 1, entry: e } as unknown as Candidate], store)).toHaveLength(1); // 4/4
  });

  it("التغطية على متن مدخل واحد لا على مجموع المرشحين: نصف الكلمات في مدخل ونصفها في آخر ⟵ لا شيء", () => {
    const cands = [cand("a", "الف باء جيم ثاء ثاء ثاء"), cand("b", "دال هاء واو ثاء ثاء ثاء")];
    expect(fallbackNear("الف باء جيم دال هاء واو", cands, store)).toHaveLength(0);
  });

  it("الإسناد لا يُحتسب: كلمات الادعاء في الإسناد فقط ⟵ لا شيء", () => {
    const e = { id: "a", source_id: "sahih-bukhari", number: 1, location: "x", page: 1, text: "حدثنا الف باء جيم عن النبي ﷺ قال: كلام مختلف تماما هنا" };
    expect(fallbackNear("الف باء جيم", [{ id: "a", kind: "book", score: 1, entry: e } as unknown as Candidate], store)).toHaveLength(0);
  });

  it("لا يتجاوز الـfallback اختيار النموذج: مع مرشح مختار يبقى حكم المسار العادي (authentic لمطابقة تامة)", async () => {
    if (!ready) return;
    const claim = "إنما الأعمال بالنيات";
    const llm = new MockProvider({
      extract: () => ({ claims: [cl(claim)] }),
      judge: () => ({ curated_id: "curated#A004", book_id: null, collection_id: null, grading_sentence: null, proposed_class: "none" }),
    });
    const r = await verifyMessage({ type: "text", text: claim }, { llm, config, route: "test" });
    expect(r.claims[0].verdict).toBe("authentic");
    expect(r.claims[0].system_note).toBeUndefined();
  });
});

describe("guardClaims: حارسا المستخرِج", () => {
  it("جزءان متجاوران من نص واحد (فراغ أو فاصلة) يُدمجان في ادعاء واحد بنصه الحرفي", () => {
    const msg = "alpha beta gamma delta epsilon zeta";
    const out = guardClaims(msg, [cl("alpha beta gamma"), cl("delta epsilon zeta")]);
    expect(out.map((c) => c.claim_text)).toEqual([msg]);
    const withComma = guardClaims("alpha beta، gamma delta", [cl("alpha beta"), cl("gamma delta")]);
    expect(withComma).toHaveLength(1);
    expect(withComma[0].claim_text).toBe("alpha beta، gamma delta");
  });

  it("سطر جديد أو نقطة أو وجود نص بينهما ⟵ ادعاءان منفصلان", () => {
    expect(guardClaims("alpha beta\ngamma delta", [cl("alpha beta"), cl("gamma delta")])).toHaveLength(2);
    expect(guardClaims("alpha beta. gamma delta", [cl("alpha beta"), cl("gamma delta")])).toHaveLength(2);
    expect(guardClaims("alpha beta وقال gamma delta", [cl("alpha beta"), cl("gamma delta")])).toHaveLength(2);
  });

  it("الآيات والفتاوى لا تُدمج", () => {
    expect(guardClaims("alpha beta gamma delta", [cl("alpha beta", "quran"), cl("gamma delta", "quran")])).toHaveLength(2);
  });

  it("ادعاء ليس مقطعاً حرفياً من الرسالة (كأن النموذج أكمله) ⟵ تحلّ الرسالة كلها محله", () => {
    const msg = "one two four five";
    const out = guardClaims(msg, [cl("one two three four five")]);
    expect(out[0].claim_text).toBe(msg);
  });

  it("ادعاء حرفي سليم يبقى كما هو، والمتداخلان يبقى الأوسع", () => {
    expect(guardClaims("قال: alpha beta gamma", [cl("alpha beta gamma")])[0].claim_text).toBe("alpha beta gamma");
    expect(guardClaims("alpha beta gamma", [cl("alpha beta"), cl("alpha beta gamma")])).toHaveLength(1);
  });
});

describe.skipIf(!ready)("fallback: النموذج لم يختر مرشحاً", () => {
  const none = { curated_id: null, book_id: null, collection_id: null, grading_sentence: null, proposed_class: "none" as const };
  const run = (claim: string) =>
    verifyMessage({ type: "text", text: claim }, { llm: new MockProvider({ extract: () => ({ claims: [cl(claim)] }), judge: () => none }), config, route: "test" });

  it("جزء قصير من حديث («لا يؤمن أحدكم») ⟵ wording_differs بمواضع متعددة وملاحظة ثابتة، لا امتناع", async () => {
    const r = await run("لا يؤمن أحدكم");
    const c = r.claims[0];
    expect(c.verdict).toBe("wording_differs");
    expect(c.sources.length).toBeGreaterThanOrEqual(2);
    expect(c.sources.every((s) => s.source_id.startsWith("sahih-"))).toBe(true);
    expect(c.sources.every((s) => !s.grading_quote)).toBe(true);
    expect(c.system_note).toBe(FALLBACK_NOTE);
    expect(r.reply_text).toContain(FALLBACK_NOTE);
    expect(r.reply_text).not.toMatch(/كاذب|مكذوب|باطل/);
    VerifyResponseSchema.parse(r);
  });

  it("كلمات حديث مشهور بترتيب مبدَّل ⟵ wording_differs لا not_found (فحص يدوي 2)", async () => {
    const c = (await run("إنما النيات بالأعمال")).claims[0];
    expect(c.verdict).toBe("wording_differs");
    expect(c.sources[0].source_id).toBe("sahih-bukhari");
  });

  it("ادعاء وهمي أو أقل من ثلاث كلمات ⟵ يبقى not_found_in_sources", async () => {
    expect((await run("ادعاء وهمي TEST_HADITH_009 لا وجود له في أي كتاب")).claims[0].verdict).toBe("not_found_in_sources");
    expect((await run("لا يؤمن")).claims[0].verdict).toBe("not_found_in_sources");
  });

  it("لا يخرج authentic أبداً من الـfallback حتى لو طابق الادعاء لفظ مدخل تماماً", async () => {
    const c = (await run("لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه")).claims[0];
    expect(c.verdict).not.toBe("authentic");
    expect(["wording_differs", "not_found_in_sources"]).toContain(c.verdict);
  });
});
