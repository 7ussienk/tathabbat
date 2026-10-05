"use client";

import { useEffect, useRef, useState } from "react";
import { ClaimCard } from "@/components/ClaimCard";
import { CopyReply } from "@/components/CopyReply";
import { ErrorBox, LoadingState } from "@/components/States";
import { Disclaimer, Icon } from "@/components/ui";
import type { VerifyResponse } from "@/lib/schemas/claim";

const MAX_CHARS = 3000;
/** حد الصوت (يطابق الخادم: lib/pipeline/normalize-input.ts) */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
/** التسجيل المباشر: يُوقَف تلقائياً عند 30 ثانية، ويُختار أول نوع يدعمه المتصفح */
const MAX_REC_SECONDS = 30;
const REC_MIMES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"];
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const AUDIO_ACCEPT = "audio/*,.ogg,.oga,.opus,.mp3,.m4a,.aac,.wav,.flac";

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
  // استخراج النص من الصوت: يملأ مربع الرسالة فقط ولا يبدأ التحقق (يبدأ بـ«تثبّت» عبر المسار النصي)
  const fileRef = useRef<HTMLInputElement>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioErr, setAudioErr] = useState<ErrorInfo | null>(null);
  const [fromAudio, setFromAudio] = useState(false);
  // التسجيل المباشر (MediaRecorder): لا يُحفظ شيء، ويُرسَل الناتج إلى /api/transcribe نفسه
  const [canRecord, setCanRecord] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<{ timer: ReturnType<typeof setInterval>; rec: MediaRecorder; send: boolean } | null>(null);

  useEffect(() => {
    setCanRecord(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    return () => stopRecording(false);
  }, []);

  function stopRecording(send: boolean) {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    r.send = send;
    clearInterval(r.timer);
    setRecording(false);
    if (r.rec.state !== "inactive") r.rec.stop();
  }

  async function startRecording() {
    setMenuOpen(false);
    setAudioErr(null);
    const mime = REC_MIMES.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) {
      setAudioErr({ message: "متصفحك لا يدعم التسجيل الصوتي.", nextStep: "ارفع ملفاً صوتياً بدل ذلك، أو اكتب الرسالة." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const n = (e as Error).name;
      setAudioErr(
        n === "NotAllowedError" || n === "SecurityError"
          ? { message: "لم يُسمح للموقع باستخدام الميكروفون.", nextStep: "اسمح بالميكروفون من إعدادات المتصفح ثم أعد المحاولة، أو ارفع ملفاً صوتياً، أو اكتب الرسالة." }
          : n === "NotFoundError" || n === "OverconstrainedError"
            ? { message: "لم نجد ميكروفوناً في جهازك.", nextStep: "وصّل ميكروفوناً ثم أعد المحاولة، أو ارفع ملفاً صوتياً، أو اكتب الرسالة." }
            : { message: "تعذّر بدء التسجيل.", nextStep: "أعد المحاولة، أو ارفع ملفاً صوتياً، أو اكتب الرسالة." },
      );
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    const t0 = Date.now();
    const st = {
      timer: setInterval(() => {
        const sec = (Date.now() - t0) / 1000;
        setElapsed(Math.floor(sec));
        if (sec >= MAX_REC_SECONDS) stopRecording(true);
      }, 250),
      rec,
      send: true,
    };
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (!st.send || !chunks.length) return;
      const type = (rec.mimeType || mime).split(";")[0];
      void onAudio(new File(chunks, `rec.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`, { type }));
    };
    recRef.current = st;
    setElapsed(0);
    setRecording(true);
    rec.start();
  }

  async function onAudio(file: File) {
    setAudioErr(null);
    if (file.size > MAX_AUDIO_BYTES) {
      setAudioErr({ message: "حجم المقطع أكبر من 2MB.", nextStep: "سجّل مقطعاً أقصر (الحد 30 ثانية) أو اقتصّ الجزء الذي فيه الحديث ثم أعد الرفع، أو اكتب الرسالة." });
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55_000);
    setAudioBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/transcribe", { method: "POST", body: fd, signal: ctrl.signal });
      const data = (await r.json()) as { status: string; text?: string; error?: { message_ar: string; next_step_ar: string } };
      if (data.status === "ok" && data.text) {
        setText(data.text.slice(0, MAX_CHARS));
        setFromAudio(true);
        setState({ phase: "idle" });
      } else {
        setAudioErr({ message: data.error?.message_ar ?? "حدث خطأ غير متوقع.", nextStep: data.error?.next_step_ar ?? "حاول مرة أخرى بعد قليل، أو اكتب الرسالة." });
      }
    } catch (e) {
      setAudioErr(
        (e as Error).name === "AbortError"
          ? { message: "استغرق استخراج النص وقتاً أطول من المعتاد.", nextStep: "أعد المحاولة بمقطع أقصر، أو اكتب الرسالة." }
          : { message: "تعذّر الاتصال بالخادم.", nextStep: "تحقق من اتصالك بالإنترنت ثم أعد المحاولة." },
      );
    } finally {
      clearTimeout(timer);
      setAudioBusy(false);
    }
  }

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
        <div className="flex items-center justify-between gap-3">
          <h2 id="input-h" className="text-lg font-semibold text-offwhite">
            الصق الرسالة
          </h2>
          <input
            ref={fileRef}
            type="file"
            accept={AUDIO_ACCEPT}
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onAudio(f);
            }}
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => (canRecord ? setMenuOpen((o) => !o) : fileRef.current?.click())}
              disabled={audioBusy || busy || recording}
              aria-describedby="audio-hint"
              aria-haspopup={canRecord ? "menu" : undefined}
              aria-expanded={canRecord ? menuOpen : undefined}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-card px-4 text-base text-line hover:border-turquoise/60 hover:text-offwhite disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0014 0M12 18v3" />
              </svg>
              {audioBusy ? "جارٍ استخراج النص…" : "صوت"}
            </button>
            {menuOpen && canRecord && (
              <div role="menu" className="absolute end-0 z-10 mt-2 w-44 space-y-1 rounded-xl border border-card bg-navy-deep p-2 shadow-lg">
                <button type="button" role="menuitem" onClick={startRecording} className="min-h-11 w-full rounded-lg px-3 text-start text-offwhite hover:bg-card">
                  سجّل الآن
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }} className="min-h-11 w-full rounded-lg px-3 text-start text-offwhite hover:bg-card">
                  ارفع ملفاً
                </button>
              </div>
            )}
          </div>
        </div>
        <p id="audio-hint" className="sr-only">
          ارفع مقطعاً صوتياً (حتى 30 ثانية) لاستخراج نصه ومراجعته قبل التحقق
        </p>
        {recording && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 p-3">
            <span aria-hidden="true" className="size-3 animate-pulse rounded-full bg-danger" />
            <span className="text-offwhite">جارٍ التسجيل…</span>
            <span aria-hidden="true" dir="ltr" className="tabular-nums text-line">
              {fmtTime(elapsed)} / {fmtTime(MAX_REC_SECONDS)}
            </span>
            <button type="button" onClick={() => stopRecording(true)} className="min-h-11 rounded-xl bg-turquoise px-5 font-semibold text-navy hover:opacity-90">
              إيقاف وإرسال
            </button>
            <button type="button" onClick={() => stopRecording(false)} className="min-h-11 rounded-xl px-4 text-line underline underline-offset-4">
              إلغاء
            </button>
          </div>
        )}
        {audioBusy && (
          <p role="status" className="text-sm text-line">
            نستخرج النص من المقطع، لحظات…
          </p>
        )}
        {audioErr && <ErrorBox message={audioErr.message} nextStep={audioErr.nextStep} />}
        <div>
          {fromAudio && (
            <p className="mb-2 text-sm text-turquoise" role="note">
              نص مُستخرَج آلياً، راجعه وصحّحه قبل التحقق
            </p>
          )}
          <label htmlFor="msg" className="sr-only">
            نص الرسالة المراد التحقق منها
          </label>
          <textarea
            id="msg"
            dir="rtl"
            value={text}
            onChange={(e) => { setText(e.target.value.slice(0, MAX_CHARS)); setAudioErr(null); }}
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
            disabled={busy || audioBusy || recording}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-turquoise px-8 text-lg font-semibold text-navy hover:opacity-90 disabled:opacity-60"
          >
            <Icon name="check" className="size-5" />
            {busy ? "جارٍ التحقق…" : "تثبّت"}
          </button>
          {text && !busy && (
            <button type="button" onClick={() => { setText(""); setFromAudio(false); setAudioErr(null); setState({ phase: "idle" }); }} className="min-h-11 rounded-xl px-4 text-line underline underline-offset-4">
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
                  onClick={() => { setText(ex.text); setFromAudio(false); setAudioErr(null); setState({ phase: "idle" }); }}
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
