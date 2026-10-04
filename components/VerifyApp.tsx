"use client";

import { useRef, useState } from "react";
import { ClaimCard } from "@/components/ClaimCard";
import { CopyReply } from "@/components/CopyReply";
import { ErrorBox, LoadingState } from "@/components/States";
import { Disclaimer, Icon } from "@/components/ui";
import type { VerifyResponse } from "@/lib/schemas/claim";

const MAX_CHARS = 3000;

/** أمثلة جاهزة تُعبّأ بنقرة (من حالات غير مصطنعة ولا مستبعدة من العرض: القاعدتان 14 و16). */
const EXAMPLES: { label: string; text: string }[] = [
  { label: "حديث مشهور", text: "قال رسول الله ﷺ: اطلبوا العلم ولو بالصين" },
  { label: "عبارة متداولة", text: "حب الوطن من الإيمان" },
  { label: "آية بخطأ", text: "قال الله تعالى: إن بعد العسر يسرا" },
  { label: "سؤال فتوى", text: "هل يجوز لي أن آخذ قرضاً لشراء بيت؟" },
];

type ErrorInfo = { message: string; nextStep: string };
type State = { phase: "idle" } | { phase: "loading" } | { phase: "done"; res: VerifyResponse } | { phase: "error"; err: ErrorInfo };

const searchLink = (t: string) => `https://dorar.net/hadith/search?q=${encodeURIComponent(t.trim().slice(0, 200))}`;

export function VerifyApp() {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function submit() {
    const t = text.trim();
    if (!t) {
      setState({ phase: "error", err: { message: "لم تكتب أي نص بعد.", nextStep: "الصق الرسالة التي تريد التحقق منها في الصندوق أعلاه ثم اضغط «تثبّت»." } });
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    setState({ phase: "loading" });
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ text: t }),
        signal: ctrl.signal,
      });
      const data = (await r.json()) as VerifyResponse & { error?: { message_ar: string; next_step_ar: string } };
      if (data.status === "error" || (!r.ok && data.error)) {
        setState({
          phase: "error",
          err: { message: data.error?.message_ar ?? "حدث خطأ غير متوقع.", nextStep: data.error?.next_step_ar ?? "حاول مرة أخرى بعد قليل." },
        });
      } else {
        setState({ phase: "done", res: data });
      }
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      setState({
        phase: "error",
        err: aborted
          ? { message: "استغرق التحقق وقتاً أطول من المعتاد.", nextStep: "أعد المحاولة، أو جرّب رسالة أقصر." }
          : { message: "تعذّر الاتصال بالخادم.", nextStep: "تحقق من اتصالك بالإنترنت ثم أعد المحاولة." },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  const busy = state.phase === "loading";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-8 pt-8">
      <section className="space-y-3 text-center">
        <h1 className="text-[clamp(1.75rem,4vw,2.8rem)] font-bold leading-tight text-offwhite">تحقّق من الرسالة الدينية قبل أن تشاركها</h1>
        <p className="text-line">الصق الرسالة، فنفكّكها إلى ادعاءات ونعرض لك حكم أهل العلم منقولاً من مصدره، مع الموضع ورابط التحقق.</p>
      </section>

      <Disclaimer />

      <section aria-labelledby="input-h" className="space-y-4 rounded-2xl border border-card bg-navy-deep p-4 sm:p-6">
        <h2 id="input-h" className="text-lg font-semibold text-offwhite">
          الصق الرسالة
        </h2>
        <div>
          <label htmlFor="msg" className="sr-only">
            نص الرسالة المراد التحقق منها
          </label>
          <textarea
            id="msg"
            dir="rtl"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            rows={6}
            placeholder="مثال: قال رسول الله ﷺ: ..."
            className="w-full resize-y rounded-xl border border-card bg-navy p-4 text-lg leading-8 text-offwhite placeholder:text-muted-light"
          />
          <p className="mt-1 text-start text-sm text-muted-light" aria-live="off">
            {text.length} من {MAX_CHARS} حرفاً
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-turquoise px-8 text-lg font-semibold text-navy hover:opacity-90 disabled:opacity-60"
          >
            <Icon name="check" className="size-5" />
            {busy ? "جارٍ التحقق…" : "تثبّت"}
          </button>
          {text && !busy && (
            <button type="button" onClick={() => { setText(""); setState({ phase: "idle" }); }} className="min-h-11 rounded-xl px-4 text-line underline underline-offset-4">
              مسح
            </button>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm text-muted-light">أو جرّب مثالاً:</p>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <li key={ex.label}>
                <button
                  type="button"
                  onClick={() => { setText(ex.text); setState({ phase: "idle" }); }}
                  className="min-h-11 rounded-full border border-card px-4 text-base text-line hover:border-turquoise/60 hover:text-offwhite"
                >
                  {ex.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div ref={resultRef} aria-live="polite" className="scroll-mt-4 space-y-5">
        {state.phase === "loading" && <LoadingState />}
        {state.phase === "error" && (
          <ErrorBox message={state.err.message} nextStep={state.err.nextStep} fallbackLink={text.trim() ? searchLink(text) : undefined} onRetry={text.trim() ? submit : undefined} />
        )}
        {state.phase === "done" && (
          <>
            <h2 className="text-xl font-semibold text-offwhite">نتيجة التحقق</h2>
            {state.res.status === "partial" && state.res.error && (
              <ErrorBox message={state.res.error.message_ar} nextStep={state.res.error.next_step_ar} fallbackLink={searchLink(text)} />
            )}
            {state.res.claims_total !== undefined && state.res.claims_examined !== undefined && state.res.claims_examined < state.res.claims_total && (
              <p role="status" className="rounded-xl border border-line/40 bg-line/10 p-4 text-line">
                فُحص {state.res.claims_examined} من {state.res.claims_total} ادعاءً؛ أعد إرسال الباقي في رسالة منفصلة.
              </p>
            )}
            {state.res.claims.map((c) => (
              <ClaimCard key={c.id} claim={c} sourceTitles={state.res.source_titles ?? {}} />
            ))}
            <CopyReply text={state.res.reply_text} />
            <Disclaimer />
          </>
        )}
      </div>
    </main>
  );
}
