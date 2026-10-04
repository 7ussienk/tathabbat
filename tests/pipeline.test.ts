/**
 * اختبارات خط المعالجة بمزوّد وهمي (بلا شبكة). تعتمد على الفهرس المبني (data/index) فتُتخطى إن غاب.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getConfig } from "../lib/config";
import { LLMError } from "../lib/llm/provider";
import { MockProvider } from "../lib/llm/mock";
import { composeReply, DISCLAIMER, RULING_NOTE, TELEGRAM_LIMIT } from "../lib/pipeline/compose-reply";
import { validateClaim } from "../lib/pipeline/validate";
import { getStore } from "../lib/retrieval/store";
import { ClaimResultSchema, VerifyResponseSchema, type ClaimResult } from "../lib/schemas/claim";
import { verifyMessage } from "../lib/verify-message";

const ready = existsSync("data/index/text-index.json") && existsSync("data/index/store.json");
const config = getConfig({ GEMINI_API_KEY: "test", CONFIDENCE_THRESHOLD: "0.75" } as unknown as NodeJS.ProcessEnv);

type X = { claim_text: string; claim_type?: string; content_level?: string };
const extract = (...claims: X[]) => () => ({
  claims: claims.map((c) => ({ claim_type: "hadith", content_level: "A", understood_as: "تسأل عن صحة هذه العبارة", ...c })),
});

describe.skipIf(!ready)("verifyMessage (مزوّد وهمي + الفهرس المحلي)", () => {
  const run = (text: string, handlers: ConstructorParameters<typeof MockProvider>[0]) => {
    const llm = new MockProvider(handlers);
    return { llm, p: verifyMessage({ type: "text", text }, { llm, config, route: "test" }) };
  };

  it("المستوى د: لا استرجاع ولا حكم، إحالة فقط", async () => {
    const { llm, p } = run("هل يجوز لي أن آخذ قرضاً؟", {
      extract: extract({ claim_text: "هل يجوز لي أن آخذ قرضاً؟", claim_type: "fatwa_request", content_level: "A" }),
    });
    const r = await p;
    expect(r.claims[0].verdict).toBe("refer_to_scholar");
    expect(r.claims[0].content_level).toBe("D");
    expect(r.claims[0].sources).toEqual([]);
    expect(llm.calls.map((c) => c.label)).toEqual(["extract"]);
    VerifyResponseSchema.parse(r);
  });

  it("مدخل منتقى: الحكم بشري، والنص حرفي من الفهرس، وبانتظار المراجعة، والرد يلتزم بقاعدة الرواية لا المسألة", async () => {
    const { p } = run("اطلبوا العلم ولو بالصين", {
      extract: extract({ claim_text: "اطلبوا العلم ولو بالصين" }),
      judge: () => ({ curated_id: "curated#W001", book_id: null, grading_sentence: null, proposed_class: "none" }),
    });
    const r = await p;
    const c = r.claims[0];
    expect(c.verdict).toBe("weak");
    expect(c.review_status).toBe("pending_review");
    expect(c.sources[0].source_id).toBe("maqasid-sakhawi");
    expect(c.sources[0].grading_quote).toContain("باطل لا أصل له");
    expect(c.sources[0].quoted_text).toContain("اطلبوا العلم ولو بالصين");
    expect(c.confidence).toBeGreaterThanOrEqual(0.75);
    expect(c.authentic_alternative?.source_id).toBe("sahih-muslim");
    expect(r.reply_text).toContain(RULING_NOTE);
    expect(r.reply_text).toContain(DISCLAIMER);
    expect(r.reply_text).toContain("بانتظار مراجعة شرعية");
    expect(r.status).toBe("ok");
    expect(r.usage?.input_tokens).toBeGreaterThan(0);
  });

  it("مدخل حي: الكود يقتطع الجملة حرفياً ويحكم بالمعجم (لم أقف عليه ← no_basis_per_scholar)", async () => {
    const { p } = run("آية من كتاب الله خير من محمد وآله", {
      extract: extract({ claim_text: "آية من كتاب الله خير من محمد وآله" }),
      judge: () => ({ curated_id: null, book_id: "maqasid-sakhawi#5", grading_sentence: "لم أقف عليه", proposed_class: "no_basis_per_scholar" }),
    });
    const c = (await p).claims[0];
    expect(c.verdict).toBe("no_basis_per_scholar");
    expect(c.sources[0].grading_quote).toBe("لم أقف عليه");
    expect(c.sources[0].location).toMatch(/رقم 5$/);
    expect(c.sources[0].url).toContain("app.turath.io/book/1263?page=");
  });

  it("جملة حكم ليست substring من المدخل ⇒ تخفيض إلى not_found_in_sources", async () => {
    const { p } = run("آية من كتاب الله خير من محمد وآله", {
      extract: extract({ claim_text: "آية من كتاب الله خير من محمد وآله" }),
      judge: () => ({ curated_id: null, book_id: "maqasid-sakhawi#5", grading_sentence: "قال الإمام إنه موضوع قطعاً", proposed_class: "fabricated" }),
    });
    const c = (await p).claims[0];
    expect(c.verdict).toBe("not_found_in_sources");
    expect(c.downgrade_reason).toBe("quote_not_substring");
    expect(c.sources).toEqual([]);
  });

  it("تعارض التصنيف المقترح مع لفظ الجملة ⇒ disputed", async () => {
    const { p } = run("آية من كتاب الله خير من محمد وآله", {
      extract: extract({ claim_text: "آية من كتاب الله خير من محمد وآله" }),
      judge: () => ({ curated_id: null, book_id: "maqasid-sakhawi#5", grading_sentence: "لم أقف عليه", proposed_class: "weak" }),
    });
    expect((await p).claims[0].verdict).toBe("disputed");
  });

  it("معرّف مرشح غير موجود في النتائج ⇒ not_found (لا مصدر مختلق)", async () => {
    const { p } = run("اطلبوا العلم ولو بالصين", {
      extract: extract({ claim_text: "اطلبوا العلم ولو بالصين" }),
      judge: () => ({ curated_id: null, book_id: "maqasid-sakhawi#99999", grading_sentence: "لا أصل له", proposed_class: "no_basis_per_scholar" }),
    });
    const c = (await p).claims[0];
    expect(c.verdict).toBe("not_found_in_sources");
    expect(c.downgrade_reason).toBe("chosen_id_not_in_results");
    expect(c.checked_sources).toEqual(["maqasid-sakhawi"]);
    expect(c.failed_sources).toEqual([]);
  });

  it("same_hadith=false أو لا مرشح ⇒ not_found_in_sources", async () => {
    const a = await run("ادعاء وهمي TEST_HADITH_001 لا وجود له", {
      extract: extract({ claim_text: "ادعاء وهمي TEST_HADITH_001 لا وجود له" }),
      judge: () => ({ curated_id: null, book_id: null, grading_sentence: null, proposed_class: "none" }),
    }).p;
    expect(a.claims[0].verdict).toBe("not_found_in_sources");
    const b = await run("اطلبوا العلم ولو بالصين", {
      extract: extract({ claim_text: "اطلبوا العلم ولو بالصين" }),
      judge: () => ({ curated_id: null, book_id: null, grading_sentence: null, proposed_class: "none" }),
    }).p;
    expect(b.claims[0].verdict).toBe("not_found_in_sources");
    expect(b.claims[0].downgrade_reason).toBe("no_candidate_chosen");
  });

  it("ثقة منخفضة (النموذج اختار مرشحاً بعيداً) ⇒ امتناع لا حكم", async () => {
    const { p } = run("عبارة وهمية TEST_HADITH_002 عن الصبر والعلم", {
      extract: extract({ claim_text: "عبارة وهمية TEST_HADITH_002 عن الصبر والعلم" }),
      judge: (req) => {
        const m = /<candidate id="(maqasid-sakhawi#\d+)"/.exec(String(req.input));
        return { curated_id: null, book_id: m?.[1] ?? null, grading_sentence: "لا أصل له", proposed_class: "no_basis_per_scholar" };
      },
    });
    const c = (await p).claims[0];
    expect(c.verdict).toBe("not_found_in_sources");
    expect(c.sources).toEqual([]);
  });

  it("المنتقى يسبق: إن تناول مرشح حي ومنتقى الحديث نفسه فالحكم من المنتقى البشري", async () => {
    const { p } = run("أحب الأسماء إلى الله عبد الله وعبد الرحمن", {
      extract: extract({ claim_text: "أحب الأسماء إلى الله عبد الله وعبد الرحمن" }),
      judge: () => ({ curated_id: "curated#A002", book_id: "maqasid-sakhawi#28", grading_sentence: null, proposed_class: "none" }),
    });
    const c = (await p).claims[0];
    expect(c.verdict).toBe("authentic");
    expect(c.sources[0].source_id).toBe("sahih-muslim");
  });

  it("معرّف من نوع خاطئ (كتاب في حقل المنتقى) يُهمل", async () => {
    const { p } = run("اطلبوا العلم ولو بالصين", {
      extract: extract({ claim_text: "اطلبوا العلم ولو بالصين" }),
      judge: () => ({ curated_id: "maqasid-sakhawi#125", book_id: null, grading_sentence: null, proposed_class: "none" }),
    });
    const c = (await p).claims[0];
    expect(c.verdict).toBe("not_found_in_sources");
    expect(c.downgrade_reason).toBe("chosen_id_not_in_results");
  });

  it("ادعاء يحوي صيغة المنتقى كاملة وزيادة تفصيل لا يُظلم في الثقة (احتواء)", async () => {
    const claim = "من تهاون بصلاته عاقبه الله بخمس عشرة عقوبة، ستة في الدنيا وثلاثة عند الموت وثلاثة في القبر وثلاثة يوم القيامة";
    const { p } = run(claim, {
      extract: extract({ claim_text: claim }),
      judge: () => ({ curated_id: "curated#W008", book_id: null, grading_sentence: null, proposed_class: "none" }),
    });
    const c = (await p).claims[0];
    expect(c.verdict).toBe("fabricated");
    expect(c.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("القرآن: تحريف كلمة ⇒ quran_misquoted مع النص الصحيح من الملف دون استدعاء الحكم", async () => {
    const { llm, p } = run("قال تعالى: لا يكلف الله نفسا إلا طاقتها", {
      extract: extract({ claim_text: "لا يكلف الله نفسا إلا طاقتها", claim_type: "quran" }),
    });
    const c = (await p).claims[0];
    expect(c.verdict).toBe("quran_misquoted");
    expect(c.sources[0].location).toBe("2:286");
    expect(c.sources[0].quoted_text).toContain("وُسْعَهَا");
    expect(llm.calls.map((x) => x.label)).toEqual(["extract"]);
  });

  it("لا ادعاء ديني ⇒ not_a_religious_claim", async () => {
    const r = await run("صباح الخير، كيف حالكم؟", { extract: () => ({ claims: [] }) }).p;
    expect(r.claims[0].verdict).toBe("not_a_religious_claim");
    expect(r.status).toBe("ok");
  });

  it("فشل Gemini في الاستخراج ⇒ status=error وcode=llm_unavailable (لا search_unavailable)", async () => {
    const r = await run("نص", { extract: new LLMError("down", "unavailable") }).p;
    expect(r.status).toBe("error");
    expect(r.error?.code).toBe("llm_unavailable");
    expect(r.claims).toEqual([]);
  });

  it("فشل الحكم لأحد الادعاءات ⇒ partial مع بقية الادعاءات", async () => {
    let n = 0;
    const r = await run("رسالة مركّبة", {
      extract: extract({ claim_text: "هل يجوز لي كذا؟", claim_type: "fatwa_request" }, { claim_text: "اطلبوا العلم ولو بالصين" }),
      judge: () => {
        n++;
        throw new LLMError("down", "unavailable");
      },
    }).p;
    expect(n).toBe(1);
    expect(r.status).toBe("partial");
    expect(r.error?.code).toBe("llm_unavailable");
    expect(r.claims.map((c) => c.verdict)).toEqual(["refer_to_scholar"]);
  });

  it("تعذّر تحميل الفهرس ⇒ search_unavailable لا «لم نجد»", async () => {
    const llm = new MockProvider({ extract: extract({ claim_text: "اطلبوا العلم ولو بالصين" }) });
    const r = await verifyMessage(
      { type: "text", text: "اطلبوا العلم ولو بالصين" },
      { llm, config, getStore: () => Promise.reject(new Error("no index")) },
    );
    expect(r.claims[0].verdict).toBe("search_unavailable");
    expect(r.claims[0].failed_sources?.length).toBeGreaterThan(0);
    expect(r.status).toBe("partial");
    expect(r.reply_text).not.toContain("لم نجد");
  });

  it("إدخال فارغ أو طويل ⇒ invalid_input دون استدعاء النموذج", async () => {
    const llm = new MockProvider({});
    expect((await verifyMessage({ type: "text", text: "   " }, { llm, config })).error?.code).toBe("invalid_input");
    expect((await verifyMessage({ type: "text", text: "ا".repeat(4001) }, { llm, config })).error?.code).toBe("invalid_input");
    expect(llm.calls).toHaveLength(0);
  });

  it("الرد المركّب يبقى ضمن حد تيليجرام (4096) مع التنبيه", async () => {
    const store = await getStore();
    const base = [...store.curated.values()].find((c) => c.id === "W024")!;
    const claim = (i: number): ClaimResult => ({
      id: `c${i}`,
      claim_text: base.claim_text,
      claim_type: "hadith",
      content_level: "A",
      verdict: "disputed",
      confidence: 0.9,
      sources: base.sources.map((s) => ({ source_id: s.source_id, title: "المقاصد الحسنة", location: s.location, quoted_text: "ن".repeat(3000), grading_quote: s.grading_quote })),
      review_status: "pending_review",
      verify_link: "https://example.test",
    });
    const { telegram_text, reply_text } = composeReply([claim(1), claim(2), claim(3), claim(4)], store);
    expect(telegram_text.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(telegram_text).toContain(DISCLAIMER);
    expect(reply_text.length).toBeGreaterThan(telegram_text.length);
  });

  it("validate: حكم إيجابي بمصدر لا يطابق المدخل ⇒ يُخفَّض ولا يبقى مصدر", async () => {
    const store = await getStore();
    const bad: ClaimResult = {
      id: "c1",
      claim_text: "ادعاء",
      claim_type: "hadith",
      content_level: "A",
      verdict: "fabricated",
      confidence: 0.9,
      sources: [{ source_id: "maqasid-sakhawi", title: "المقاصد", location: "1/63 رقم 125", quoted_text: "نص مختلق لا وجود له في المدخل", grading_quote: "موضوع" }],
      review_status: "pending_review",
      verify_link: "x",
    };
    const out = validateClaim(bad, { store, retrievedIds: new Set(["maqasid-sakhawi#125"]) });
    expect(out.verdict).toBe("not_found_in_sources");
    expect(out.downgrade_reason).toMatch(/^validation_failed:/);
    expect(out.sources).toEqual([]);
    ClaimResultSchema.parse(out);

    const noSource = validateClaim({ ...bad, sources: [] }, { store, retrievedIds: new Set() });
    expect(noSource.downgrade_reason).toBe("validation_failed:no_source");
    const noBasisNoQuote = validateClaim(
      { ...bad, verdict: "no_basis_per_scholar", sources: [{ ...bad.sources[0], quoted_text: "حديث" , grading_quote: undefined }] },
      { store, retrievedIds: new Set(["maqasid-sakhawi#125"]) },
    );
    expect(noBasisNoQuote.downgrade_reason).toBe("validation_failed:no_grading_quote");
  });
});
