import type { SourceRef } from "@/lib/schemas/claim";
import { Icon } from "@/components/ui";

function linkLabel(url: string): string {
  try {
    const h = new URL(url).hostname;
    if (h.includes("shamela")) return "افتح الصفحة في الشاملة";
    if (h.includes("turath")) return "افتح الصفحة في تراث";
  } catch {
    /* رابط غير صالح: نص عام */
  }
  return "افتح المصدر";
}

/**
 * كتلة النص المنقول من المصدر (docs/DESIGN.md §5): حرفية من الكود لا من النموذج، بخلفية وخط يميزانها
 * عن أي نص مولَّد. حكم الإمام بنصه (grading_quote) أولاً، والمقطع الأوسع من المدخل في «السياق».
 */
export function SourceQuote({ s, label = "نص منقول من المصدر", quran = false }: { s: SourceRef; label?: string; quran?: boolean }) {
  // الصحيحان: يُفصل الإسناد عن المتن بصرياً ويُطوى الإسناد خلف زر؛ النص الكامل حرفياً يبقى في DOM وفي quoted_text (matn_from يحسبه الكود)
  const split = !s.grading_quote && !!s.matn_from && s.matn_from > 0 && s.matn_from < s.quoted_text.length;
  const isnad = split ? s.quoted_text.slice(0, s.matn_from) : "";
  const matn = split ? s.quoted_text.slice(s.matn_from) : "";
  const main = split ? matn : (s.grading_quote ?? s.quoted_text);
  const hasContext = !!s.grading_quote && s.quoted_text.trim() !== s.grading_quote.trim();
  const font = quran ? "font-quran" : "font-quote";
  return (
    <figure className="rounded-xl border border-card bg-card/40 p-4">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-line">
        <span className="font-medium text-turquoise">{label}</span>
        <span>
          «{s.title}»{s.author ? ` — ${s.author}` : ""}
        </span>
        <span className="text-muted-light" dir="rtl">
          [{s.location}]
        </span>
      </figcaption>
      {split && isnad.trim() && (
        <details className="mb-3 rounded-lg border border-card p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-line">عرض الإسناد</summary>
          <p className={`${font} mt-2 whitespace-pre-line text-base leading-[2.1] text-muted-light`} lang="ar" data-part="isnad">
            {isnad}
          </p>
        </details>
      )}
      {split && <p className="mb-1 text-sm font-medium text-turquoise">المتن</p>}
      <blockquote className={`${font} text-[1.375rem] leading-[2.2] text-offwhite`} lang="ar" data-part={split ? "matn" : undefined}>
        «{main}»
      </blockquote>
      {hasContext && (
        <details className="mt-3 rounded-lg border border-card p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-line">السياق من نص المدخل (حرفي)</summary>
          <p className={`${font} mt-2 whitespace-pre-line text-lg leading-[2.1] text-line`}>{s.quoted_text}</p>
        </details>
      )}
      {s.attribution_note && <p className="mt-3 text-sm text-muted-light">{s.attribution_note}</p>}
      {s.url && (
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg text-base text-turquoise underline underline-offset-4">
          <Icon name="link" className="size-4" />
          {linkLabel(s.url)}
          <span className="sr-only">(يفتح في نافذة جديدة)</span>
        </a>
      )}
    </figure>
  );
}
