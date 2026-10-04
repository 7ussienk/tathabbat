/**
 * not_checked (قرار 109): لا يُحذف ادعاء بصمت حين تقطعه مهلة المعالجة أو يفشل نداؤه أو يزيد عن 6 ادعاءات.
 * مزوّد وهمي بلا شبكة. الاختبارات التي تحتاج الفهرس المبني تُتخطى إن غاب.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getConfig } from "../lib/config";
import { LLMError, type GenerateJsonRequest, type LLMProvider, type LLMResult } from "../lib/llm/provider";
import { MockProvider } from "../lib/llm/mock";
import { MAX_CLAIMS } from "../lib/pipeline/extract-claims";
import { ClaimResultSchema, POSITIVE_VERDICTS, VerifyResponseSchema } from "../lib/schemas/claim";
import { VERDICT_LABELS } from "../lib/verdict-labels";
import { verifyMessage } from "../lib/verify-message";

const ready = existsSync("data/index/text-index.json") && existsSync("data/index/store.json");
const config = getConfig({ GEMINI_API_KEY: "test", CONFIDENCE_THRESHOLD: "0.75" } as unknown as NodeJS.ProcessEnv);
const claim = (claim_text: string, claim_type: "hadith" | "fatwa_request" = "fatwa_request") => ({ claim_text, claim_type, content_level: "A", understood_as: "x" });

describe("not_checked: التسمية والمخطط", () => {
  it("له تسمية ومحايد، وليس حكماً إيجابياً (لا يدخل حساب الإسناد)", () => {
    expect(VERDICT_LABELS.not_checked.label).toContain("لم نفحص");
    expect(VERDICT_LABELS.not_checked.tone).toBe("neutral");
    expect(POSITIVE_VERDICTS).not.toContain("not_checked");
  });
});

describe("زيادة الادعاءات على الحد", () => {
  const lines = Array.from({ length: 8 }, (_, i) => `هل يجوز لي أمر رقم ${i + 1}؟`);
  const llm = () => new MockProvider({ extract: () => ({ claims: lines.map((l) => claim(l)) }) });

  it("يُفحص أول 6 فقط والباقي يظهر بحكم not_checked بنصّه، مع «فُحص 6 من 8» في الرد والحقول", async () => {
    const r = await verifyMessage({ type: "text", text: lines.join("\n") }, { llm: llm(), config, route: "test" });
    expect(MAX_CLAIMS).toBe(6);
    expect(r.claims).toHaveLength(8);
    expect(r.claims.filter((c) => c.verdict === "not_checked").map((c) => c.claim_text)).toEqual([lines[6], lines[7]]);
    expect(r.claims.slice(0, 6).every((c) => c.verdict === "refer_to_scholar")).toBe(true);
    expect([r.claims_total, r.claims_examined]).toEqual([8, 6]);
    expect(r.status).toBe("partial");
    expect(r.error?.code).toBe("claims_limit");
    expect(r.reply_text).toContain("فُحص 6 من 8 ادعاءً");
    expect(r.reply_text).toContain(lines[6]);
    expect(r.reply_text).toContain(lines[7]);
    expect(r.reply_text).toContain("لم نفحص هذا الادعاء");
    expect(r.telegram_text).toContain("فُحص 6 من 8");
    r.claims.forEach((c) => ClaimResultSchema.parse(c));
    VerifyResponseSchema.parse(r);
  });

  it("ستة ادعاءات أو أقل ⟵ لا not_checked ولا سطر «فُحص»", async () => {
    const six = lines.slice(0, 6);
    const r = await verifyMessage({ type: "text", text: six.join("\n") }, { llm: new MockProvider({ extract: () => ({ claims: six.map((l) => claim(l)) }) }), config, route: "test" });
    expect(r.claims.some((c) => c.verdict === "not_checked")).toBe(false);
    expect(r.reply_text).not.toContain("فُحص");
    expect(r.status).toBe("ok");
  });
});

describe.skipIf(!ready)("فشل نداء الحكم أو انتهاء المهلة الكلية", () => {
  const msg = "هل يجوز لي أمر؟\nاطلبوا العلم ولو بالصين";
  const extract = () => ({ claims: [claim("هل يجوز لي أمر؟"), claim("اطلبوا العلم ولو بالصين", "hadith")] });

  it("فشل الحكم لأحد الادعاءات ⟵ يظهر not_checked بنصّه (لا يُحذف) وحالة partial وسطر العدد", async () => {
    const llm = new MockProvider({ extract, judge: new LLMError("down", "unavailable") });
    const r = await verifyMessage({ type: "text", text: msg }, { llm, config, route: "test" });
    expect(r.status).toBe("partial");
    expect(r.error?.code).toBe("llm_unavailable");
    expect(r.claims.map((c) => c.verdict)).toEqual(["refer_to_scholar", "not_checked"]);
    expect(r.claims[1].claim_text).toBe("اطلبوا العلم ولو بالصين");
    expect([r.claims_total, r.claims_examined]).toEqual([2, 1]);
    expect(r.reply_text).toContain("فُحص 1 من 2");
    expect(r.reply_text).toContain("اطلبوا العلم ولو بالصين");
  });

  it("انتهاء المهلة الكلية (25ث في الإنتاج) أثناء الحكم ⟵ not_checked لا حذف", async () => {
    const slow: LLMProvider = {
      async generateJson<T>(req: GenerateJsonRequest<T>): Promise<LLMResult<T>> {
        if (req.label === "extract") return { data: req.schema.parse(extract()), usage: { input_tokens: 1, output_tokens: 1, thought_tokens: 0 } };
        await new Promise((res) => setTimeout(res, 400));
        throw new LLMError("late", "timeout");
      },
    };
    const fast = getConfig({ GEMINI_API_KEY: "test", OVERALL_TIMEOUT_MS: "120" } as unknown as NodeJS.ProcessEnv);
    const r = await verifyMessage({ type: "text", text: msg }, { llm: slow, config: fast, route: "test" });
    expect(r.claims.map((c) => c.verdict)).toEqual(["refer_to_scholar", "not_checked"]);
    expect(r.status).toBe("partial");
  });

  it("فشل الحكم لكل الادعاءات المفحوصة ⟵ خطأ llm_unavailable كما كان (لا بطاقات فارغة)", async () => {
    const llm = new MockProvider({ extract: () => ({ claims: [claim("اطلبوا العلم ولو بالصين", "hadith")] }), judge: new LLMError("down", "unavailable") });
    const r = await verifyMessage({ type: "text", text: "اطلبوا العلم ولو بالصين" }, { llm, config, route: "test" });
    expect(r.status).toBe("error");
    expect(r.error?.code).toBe("llm_unavailable");
    expect(r.claims).toEqual([]);
  });
});
