/**
 * verifyMessage(): نقطة الدخول الوحيدة لخط المعالجة، وتنادي بها المسارات الثلاثة (/api/verify و/api/telegram
 * والمسار الآلي). النص فقط في هذه المرحلة؛ الصوت والصور يدخلان في normalize-input لاحقاً.
 */
import { getConfig, type Config } from "@/lib/config";
import { GeminiProvider } from "@/lib/llm/gemini";
import { LLMError, type CallMeta, type LLMProvider, type LLMUsage } from "@/lib/llm/provider";
import { logRequest } from "@/lib/log";
import { VERSIONS } from "@/lib/versions";
import { checkCurated, checkEntry, exactCollection, fallbackNear, nearestEntry } from "@/lib/pipeline/ordered-check";
import type { CollectionHit } from "@/lib/pipeline/judge";
import { buildCollection, buildCurated, buildLive, buildWordingFallback, buildWordingFromCurated, buildWordingFromEntry, mergeCollection, buildNotFound, buildNotReligious, buildQuran, buildRefer, buildSearchUnavailable, type ExtractedClaim } from "@/lib/pipeline/build-claim";
import { composeReply, DISCLAIMER } from "@/lib/pipeline/compose-reply";
import { extractClaims } from "@/lib/pipeline/extract-claims";
import { judgeClaim } from "@/lib/pipeline/judge";
import { retrieve } from "@/lib/pipeline/retrieve";
import { validateClaim } from "@/lib/pipeline/validate";
import { QURAN_SOURCE_ID, verifyQuran } from "@/lib/quran/quran";
import { getStore, type Store } from "@/lib/retrieval/store";
import type { ClaimResult, VerifyResponse } from "@/lib/schemas/claim";

export type VerifyInput = { type: "text"; text: string };
export type VerifyDeps = {
  llm?: LLMProvider | null;
  getStore?: () => Promise<Store>;
  config?: Config;
  route?: string;
  /** false ⇒ تجاهل data/curated (قياس «بدون المنتقى» في التقييم: القرار 51). الافتراضي true. */
  useCurated?: boolean;
};

export const MAX_TEXT_CHARS = 4000;

const ERRORS = {
  llm_unavailable: {
    code: "llm_unavailable",
    message_ar: "تعذّر الاتصال بخدمة الذكاء الاصطناعي الآن، فلم نستطع تحليل الرسالة.",
    next_step_ar: "حاول بعد دقائق، أو تحقق بنفسك عبر رابط البحث الخارجي.",
  },
  invalid_input: {
    code: "invalid_input",
    message_ar: `النص فارغ أو أطول من ${MAX_TEXT_CHARS} حرفاً.`,
    next_step_ar: "الصق رسالة أقصر (فقرة أو فقرتين) ثم أعد المحاولة.",
  },
} as const;

const zeroUsage = (): LLMUsage => ({ input_tokens: 0, output_tokens: 0, thought_tokens: 0 });
const add = (a: LLMUsage, b: LLMUsage): LLMUsage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  thought_tokens: a.thought_tokens + b.thought_tokens,
});

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new LLMError("انتهت المهلة الكلية للمعالجة", "timeout")), Math.max(1, ms));
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}

export async function verifyMessage(input: VerifyInput, deps: VerifyDeps = {}): Promise<VerifyResponse> {
  const t0 = Date.now();
  const request_id = globalThis.crypto.randomUUID();
  const config = deps.config ?? getConfig();
  const timings: Record<string, number> = {};
  let usage = zeroUsage();
  /** أثر نداءات النموذج (الخطوة والنموذج والزمن والنتيجة): مصدر أي تأخر، تقني بلا نص */
  const trace: CallMeta[] = [];
  const traceOut = () => trace.map((t) => ({ label: t.label, attempts: t.attempts.map((a) => ({ model: a.model, ms: a.ms, outcome: a.outcome })) }));
  const noteFailure = (label: string, e: unknown) => {
    const attempts = (e as LLMError).attempts;
    if (attempts?.length) trace.push({ label, attempts });
  };

  const finish = (partial: Omit<VerifyResponse, "request_id" | "input_type" | "disclaimer" | "timings_ms" | "usage" | "reply_text" | "telegram_text"> & { reply_text?: string; telegram_text?: string }, store: Store | null): VerifyResponse => {
    timings.total = Date.now() - t0;
    const composed = partial.claims.length
      ? composeReply(partial.claims, store)
      : { reply_text: partial.error?.message_ar ?? "", telegram_text: partial.error?.message_ar ?? "" };
    const cost = (usage.input_tokens * config.PRICE_IN_PER_M + usage.output_tokens * config.PRICE_OUT_PER_M) / 1e6;
    const res: VerifyResponse = {
      request_id,
      input_type: "text",
      disclaimer: DISCLAIMER,
      timings_ms: timings,
      versions: { ...VERSIONS },
      llm_trace: traceOut(),
      source_titles: Object.fromEntries(
        [...new Set(partial.claims.flatMap((c) => c.checked_sources ?? []))].flatMap((id) => (store?.sourceMeta[id] ? [[id, store.sourceMeta[id].title]] : [])),
      ),
      usage: { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: Math.round(cost * 1e6) / 1e6 },
      ...composed,
      ...partial,
    };
    logRequest({
      ts: new Date().toISOString(),
      request_id,
      route: deps.route ?? "verifyMessage",
      input_type: "text",
      status: res.status,
      duration_ms: timings.total,
      claims_count: res.claims.length,
      verdicts: res.claims.map((c) => c.verdict),
      downgrades: res.claims.filter((c) => c.downgrade_reason?.startsWith("validation_failed")).length,
      tokens_in: usage.input_tokens,
      tokens_out: usage.output_tokens,
      cost_estimate_usd: res.usage!.cost_usd,
      error_code: res.error?.code,
      llm_calls: res.llm_trace,
    });
    return res;
  };

  const text = input.text.trim();
  if (!text || text.length > MAX_TEXT_CHARS) return finish({ claims: [], status: "error", error: ERRORS.invalid_input }, null);

  const llm = deps.llm !== undefined ? deps.llm : config.GEMINI_API_KEY ? new GeminiProvider({
          apiKey: config.GEMINI_API_KEY,
          model: config.GEMINI_MODEL,
          fallbackModel: config.GEMINI_FALLBACK_MODEL,
          firstTimeoutMs: config.LLM_FIRST_TIMEOUT_MS,
          fallbackTimeoutMs: config.LLM_FALLBACK_TIMEOUT_MS,
        }) : null;
  if (!llm) return finish({ claims: [], status: "error", error: ERRORS.llm_unavailable }, null);

  const deadline = t0 + config.OVERALL_TIMEOUT_MS;

  // 1) تحميل الفهرس المحلي بالتوازي مع الاستخراج (فشله لا يعطّل الاستخراج)
  const storePromise = (deps.getStore ?? getStore)().then(
    (s) => ({ ok: true as const, s }),
    (e: unknown) => ({ ok: false as const, e }),
  );

  // 2+3) استخراج الادعاءات وتصنيفها
  let extracted: ExtractedClaim[];
  const te = Date.now();
  try {
    const r = await withDeadline(extractClaims(llm, text), deadline - Date.now());
    extracted = r.claims;
    usage = add(usage, r.usage);
    if (r.meta) trace.push(r.meta);
  } catch (e) {
    noteFailure("extract", e);
    timings.extract = Date.now() - te;
    return finish({ claims: [], status: "error", error: ERRORS.llm_unavailable }, null);
  }
  timings.extract = Date.now() - te;

  const storeRes = await storePromise;
  const store = storeRes.ok ? storeRes.s : null;

  if (extracted.length === 0) return finish({ claims: [buildNotReligious(text)], status: "ok" }, store);

  // 4–6) لكل ادعاء: استرجاع ← حكم ← تحقق (بالتوازي)
  const tc = Date.now();
  let llmFailures = 0;
  const results = await Promise.all(
    extracted.map(async (c, idx): Promise<ClaimResult | null> => {
      try {
        return await withDeadline(processClaim(c, idx), deadline - Date.now());
      } catch (e) {
        if (e instanceof LLMError) {
          llmFailures++;
          noteFailure("judge", e);
        } else throw e;
        return null;
      }
    }),
  );
  timings.claims = Date.now() - tc;

  async function processClaim(c: ExtractedClaim, idx: number): Promise<ClaimResult> {
    if (c.content_level === "D" || c.claim_type === "fatwa_request") return buildRefer(c, idx);

    if (c.claim_type === "quran") {
      const m = verifyQuran(c.claim_text);
      if (m.kind !== "none") {
        const r = buildQuran(c, idx, m);
        return validateClaim(r, { store: store ?? ({ entries: new Map(), curated: new Map(), indexedSources: [] } as unknown as Store), retrievedIds: new Set() });
      }
      // لم يُطابق القرآن: قد يكون المصنِّف أخطأ النوع، فنكمل بحثاً في الفهرس
    }

    if (!store) return buildSearchUnavailable(c, idx, ["text-index"]);

    const retrieved = retrieve(store, c.claim_text, undefined, { curated: deps.useCurated });
    const d = await judgeClaim(llm!, c.claim_text, retrieved, config.CONFIDENCE_THRESHOLD);
    usage = add(usage, d.usage);
    if (d.meta) trace.push(d.meta);
    const retrievedIds = new Set(retrieved.candidates.map((x) => x.id));

    // بعد اختيار المرشح: مطابقة اللفظ المرتّبة (scoring-2026-10-04.2). المطابقة التامة وحدها تأخذ حكم المدخل؛
    // القريبة (أو المعاد ترتيبها) ⟵ wording_differs (لفظ المصدر حرفياً بلا حكم)، والبعيدة ⟵ لا مطابقة (not_found_in_sources).
    // والحديث الواحد يتكرر في الصحيحين بألفاظ متقاربة: فإن طابق لفظ الادعاء أحد مداخلهما المسترجعة مطابقة تامة فهو authentic.
    const far = (o: { lcsCov: number }, conf: number) => buildNotFound(c, idx, store, `ordered_mismatch:lcs=${o.lcsCov.toFixed(2)}`, conf * 0.5);
    const sahih = d.kind === "none" ? undefined : exactCollection(c.claim_text, retrieved.candidates);
    const viaSahih = (conf: number): ClaimResult => {
      const hit: CollectionHit = { candidate: sahih!, coverage: 1, confidence: conf };
      return validateClaim(buildCollection(c, idx, { kind: "collection", hit, confidence: conf, usage: d.usage, meta: d.meta }, store), { store, retrievedIds });
    };
    let r: ClaimResult;
    if (d.kind === "none") {
      // لم يختر النموذج مرشحاً: قبل الامتناع يفحص الكود مداخل الصحيحين المسترجَعة بالتغطية الكثيفة (جزء من حديث أو تبديل كلمات) ويعرض لفظ المصدر بلا حكم (قرار 106)
      const fb = d.reason === "no_candidates" ? [] : fallbackNear(c.claim_text, retrieved.candidates, store);
      r = fb.length ? validateClaim(buildWordingFallback(c, idx, store, fb, d.reason.split(":")[0]), { store, retrievedIds: new Set([...retrievedIds, ...fb.map((h) => h.entry.id)]) }) : buildNotFound(c, idx, store, d.reason, d.confidence);
    }
    else if (d.kind === "curated") {
      const o = checkCurated(c.claim_text, d.candidate.curated, store);
      if (o.kind === "exact") r = validateClaim(buildCurated(c, idx, d, store), { store, retrievedIds, curatedId: d.candidate.id });
      else if (sahih) r = viaSahih(Math.max(d.confidence, 0.9));
      else if (o.kind === "near") r = validateClaim(buildWordingFromCurated(c, idx, store, d.candidate.curated, d.confidence, o), { store, retrievedIds, curatedId: d.candidate.id });
      else r = far(o, d.confidence);
    } else if (d.kind === "collection") {
      const e = d.hit.candidate.entry;
      const o = checkEntry(c.claim_text, e);
      if (o.kind === "exact") r = validateClaim(buildCollection(c, idx, d, store), { store, retrievedIds });
      else if (sahih) r = viaSahih(Math.max(d.confidence, 0.9));
      else if (o.kind === "near") {
        const n = nearestEntry(c.claim_text, e, retrieved.candidates) ?? { entry: e, o };
        r = validateClaim(buildWordingFromEntry(c, idx, store, n.entry, d.confidence, n.o), { store, retrievedIds });
      } else r = far(o, d.confidence);
    } else {
      const e = d.candidate.entry;
      const o = checkEntry(c.claim_text, e);
      if (o.kind === "exact") {
        const live = buildLive(c, idx, d, store);
        r = validateClaim(sahih ? mergeCollection(live, c, idx, { candidate: sahih, coverage: 1, confidence: d.confidence }, store) : live, { store, retrievedIds });
      } else if (sahih) r = viaSahih(Math.max(d.confidence, 0.9));
      else if (o.kind === "near") {
        const n = nearestEntry(c.claim_text, e, retrieved.candidates) ?? { entry: e, o };
        r = validateClaim(buildWordingFromEntry(c, idx, store, n.entry, d.confidence, n.o), { store, retrievedIds });
      } else r = far(o, d.confidence);
    }

    if (r.verdict === "not_found_in_sources" && c.claim_type === "quran") {
      r = { ...r, checked_sources: [QURAN_SOURCE_ID, ...(r.checked_sources ?? [])] };
    }
    return r;
  }

  const claims = results.filter((x): x is ClaimResult => x !== null);
  if (claims.length === 0) return finish({ claims: [], status: "error", error: ERRORS.llm_unavailable }, store);
  if (llmFailures > 0) return finish({ claims, status: "partial", error: ERRORS.llm_unavailable }, store);
  if (claims.some((c) => c.verdict === "search_unavailable")) {
    return finish(
      { claims, status: "partial", error: { code: "search_unavailable", message_ar: "تعذّر تحميل فهرس المصادر المحلي.", next_step_ar: "حاول بعد قليل." } },
      store,
    );
  }
  return finish({ claims, status: "ok" }, store);
}
