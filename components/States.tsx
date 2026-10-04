"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";

/** حالة التحميل: هيكل رمادي مع «نبحث في المصادر…»، وبعد 10 ثوانٍ «ما زلنا نبحث» (docs/DESIGN.md §5). */
export function LoadingState() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <p className="text-center text-line">{slow ? "ما زلنا نبحث في المصادر، شكراً لصبرك…" : "نبحث في المصادر…"}</p>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden="true" className="animate-pulse space-y-3 rounded-2xl border border-card bg-navy-deep p-6">
          <div className="h-5 w-3/4 rounded bg-card" />
          <div className="h-7 w-32 rounded-full bg-card" />
          <div className="h-24 rounded-xl bg-card/60" />
        </div>
      ))}
    </div>
  );
}

/** حالة الخطأ: تقول ما حدث وما الخطوة التالية، ومعها رابط بحث بديل (docs/DESIGN.md §5). */
export function ErrorBox({ message, nextStep, fallbackLink, onRetry }: { message: string; nextStep: string; fallbackLink?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-2xl border border-danger/40 bg-danger/10 p-5">
      <p className="flex items-start gap-2 text-base font-medium text-danger">
        <Icon name="alert" className="mt-1 size-5" />
        {message}
      </p>
      <p className="text-line">{nextStep}</p>
      <div className="flex flex-wrap items-center gap-4">
        {onRetry && (
          <button type="button" onClick={onRetry} className="min-h-11 rounded-xl border border-line/50 px-5 text-offwhite hover:bg-line/10">
            حاول مرة أخرى
          </button>
        )}
        {fallbackLink && (
          <a href={fallbackLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-turquoise underline underline-offset-4">
            <Icon name="search" className="size-4" />
            ابحث بنفسك في الدرر السنية
            <span className="sr-only">(يفتح في نافذة جديدة)</span>
          </a>
        )}
      </div>
    </div>
  );
}
