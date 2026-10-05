"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";

/** الرد الجاهز للمشاركة: صندوق مستقل بزر نسخ. نصه من قوالب ثابتة ويلتزم بقاعدة الحكم على الرواية لا المسألة. */
export function CopyReply({ text }: { text: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      // احتياط للمتصفحات التي تمنع الواجهة (مثل بعض WebView)
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(ok ? "ok" : "fail");
      } catch {
        setCopied("fail");
      }
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <section aria-labelledby="reply-h" className="space-y-3 rounded-2xl border border-card bg-navy-deep p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="reply-h" className="text-lg font-semibold text-offwhite">
          الرد الجاهز للمشاركة
        </h3>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-turquoise px-5 font-medium text-navy hover:opacity-90"
        >
          <Icon name="copy" className="size-4" />
          نسخ الرد الجاهز
        </button>
      </div>
      <p className="min-w-0 max-w-full whitespace-pre-line break-words rounded-xl border border-card bg-card/30 p-4 text-base leading-8 text-line [overflow-wrap:anywhere]" dir="rtl">
        {text}
      </p>
      <p role="status" aria-live="polite" className="min-h-6 text-sm text-turquoise">
        {copied === "ok" && "تم النسخ، يمكنك لصقه في المجموعة."}
        {copied === "fail" && <span className="text-danger">تعذّر النسخ تلقائياً؛ حدّد النص أعلاه وانسخه يدوياً.</span>}
      </p>
    </section>
  );
}
