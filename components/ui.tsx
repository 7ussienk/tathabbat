import type { ReactNode } from "react";
import type { Verdict } from "@/lib/schemas/claim";
import { VERDICT_LABELS } from "@/lib/verdict-labels";

/** أنماط الدلالة اللونية (docs/DESIGN.md §2): ألوان من متغيرات CSS فقط، ولا اعتماد على اللون وحده (أيقونة + نص). */
export const TONE: Record<"ok" | "warn" | "danger" | "info" | "neutral", string> = {
  ok: "text-ok border-ok/40 bg-ok/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  danger: "text-danger border-danger/40 bg-danger/10",
  info: "text-info border-info/40 bg-info/10",
  neutral: "text-line border-line/40 bg-line/10",
};

type IconName = "check" | "alert" | "x" | "info" | "minus" | "clock" | "copy" | "link" | "search";

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  alert: (
    <>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4M12 17.5v.01" />
    </>
  ),
  x: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  minus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 012-2h9" />
    </>
  ),
  link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
};

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

const VERDICT_ICON: Record<Verdict, IconName> = {
  authentic: "check",
  quran_verified: "check",
  weak: "alert",
  disputed: "alert",
  misattributed: "alert",
  quran_misquoted: "alert",
  fabricated: "x",
  no_basis_per_scholar: "x",
  not_found_in_sources: "minus",
  search_unavailable: "minus",
  not_a_religious_claim: "minus",
  scholar_text_only: "info",
  wording_differs: "alert",
  refer_to_scholar: "info",
  not_checked: "minus",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const v = VERDICT_LABELS[verdict];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-base font-medium ${TONE[v.tone]}`}>
      <Icon name={VERDICT_ICON[verdict]} className="size-4" />
      {v.label}
    </span>
  );
}

const LEVELS: Record<"A" | "B" | "C" | "D", { ar: string; hint: string }> = {
  A: { ar: "أ", hint: "حديث أو آية أو معلومة أصلية" },
  B: { ar: "ب", hint: "شرح أو معنى مستنبط" },
  C: { ar: "ج", hint: "مسألة خلافية" },
  D: { ar: "د", hint: "فتوى أو حالة شخصية: لا حكم من الأداة" },
};

export function LevelBadge({ level }: { level: "A" | "B" | "C" | "D" }) {
  const l = LEVELS[level];
  return (
    <span title={l.hint} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-card px-3 py-1 text-sm text-muted-light">
      <span className="sr-only">مستوى المحتوى:</span>
      المستوى {l.ar}
    </span>
  );
}

export function PendingReviewBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-sm text-warn">
      <Icon name="clock" className="size-4" />
      بانتظار مراجعة شرعية
    </span>
  );
}

export function GeneratedNote({ text }: { text: string }) {
  return (
    <p className="text-sm font-light text-muted-light">
      <span className="ms-1 rounded border border-card px-1.5 py-0.5 text-xs">مولَّد</span>
      كيف فهمنا رسالتك: {text}
    </p>
  );
}

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`rounded-xl border border-card bg-navy-deep px-4 py-3 text-center text-sm text-line ${className}`} role="note">
      أداة ذكاء اصطناعي للمساعدة في التحقق، وليست مفتياً.
    </p>
  );
}
