import type { ClaimResult } from "@/lib/schemas/claim";
import { GeneratedNote, Icon, LevelBadge, PendingReviewBadge, VerdictBadge } from "@/components/ui";
import { SourceQuote } from "@/components/SourceQuote";

const REFER_TEXT = "هذا السؤال يخص حالة شخصية أو فتوى. هذه الأداة لا تُفتي ولا تُصدر حكماً هنا؛ اسأل عالماً أو جهة إفتاء رسمية.";

/** بطاقة الادعاء (docs/DESIGN.md §5): الادعاء، شارتا الحكم والمستوى، النص المنقول، البديل الصحيح، السطر المولَّد، المراجعة. */
export function ClaimCard({ claim, sourceTitles }: { claim: ClaimResult; sourceTitles: Record<string, string> }) {
  const c = claim;
  const isQuran = c.verdict === "quran_verified" || c.verdict === "quran_misquoted";
  const checked = (c.checked_sources ?? []).map((id) => sourceTitles[id] ?? id);
  const headingId = `claim-${c.id}`;
  return (
    <article aria-labelledby={headingId} className="space-y-4 rounded-2xl border border-card bg-navy-deep p-4 sm:p-6">
      <h3 id={headingId} className="text-lg font-semibold leading-8 text-offwhite">
        «{c.claim_text}»
      </h3>

      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={c.verdict} />
        <LevelBadge level={c.content_level} />
        {c.review_status === "pending_review" && c.sources.length > 0 && <PendingReviewBadge />}
      </div>

      {c.verdict === "refer_to_scholar" && <p className="rounded-xl border border-info/40 bg-info/10 p-4 text-info">{REFER_TEXT}</p>}

      {c.verdict === "not_a_religious_claim" && <p className="text-line">لم نجد في هذا النص ادعاءً دينياً يحتاج إلى تحقق.</p>}

      {c.verdict === "not_checked" && (
        <div className="space-y-2 rounded-xl border border-line/40 bg-line/10 p-4 text-line">
          <p>لم نفحص هذا الادعاء لأن الوقت المتاح انتهى أو لأن الرسالة تجاوزت عدد الادعاءات المفحوصة. أعد إرساله وحده لنفحصه.</p>
          <a href={c.verify_link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-turquoise underline underline-offset-4">
            <Icon name="search" className="size-4" />
            أو ابحث عنه في الدرر السنية
            <span className="sr-only">(يفتح في نافذة جديدة)</span>
          </a>
        </div>
      )}

      {c.verdict === "search_unavailable" && (
        <p className="rounded-xl border border-line/40 bg-line/10 p-4 text-line">
          تعذّر تحميل فهرس المصادر الآن، ولذلك لا نستطيع الجزم بشيء عن هذا الادعاء. حاول بعد قليل.
        </p>
      )}

      {c.verdict === "not_found_in_sources" && (
        <div className="space-y-2 rounded-xl border border-line/40 bg-line/10 p-4 text-line">
          <p>
            لم نجد له أصلاً في المصادر المعتمدة التي فُحصت{checked.length ? `: ${checked.join("، ")}` : ""}.
          </p>
          <p className="text-sm text-muted-light">
            هذه المصادر لا تغطي كل كتب القائمة المعتمدة، فهذا ليس حكماً شرعياً على النص ولا يعني أنه باطل. يمكنك التحقق بنفسك:
          </p>
          <a href={c.verify_link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-turquoise underline underline-offset-4">
            <Icon name="search" className="size-4" />
            ابحث عنه في الدرر السنية
            <span className="sr-only">(يفتح في نافذة جديدة)</span>
          </a>
        </div>
      )}

      {c.verdict === "wording_differs" && c.system_note && <p className="rounded-xl border border-card bg-card/30 p-4 text-line">{c.system_note}</p>}

      {c.verdict === "wording_differs" && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-warn">
          اللفظ الذي وصلك يختلف عمّا في المصدر. هذا لفظ المصدر نفسه، وقد يكون ما وصلك روايةً أخرى للحديث؛ لا نصف ما وصلك بالخطأ ولا بالكذب، لكننا لا نحكم عليه بلفظه هذا.
        </p>
      )}

      {c.verdict === "quran_misquoted" && <p className="text-base text-warn">النص الصحيح للآية كما في المصحف:</p>}

      {c.sources.map((s, i) => (
        <SourceQuote
          key={`${s.source_id}-${s.location}-${i}`}
          s={s}
          quran={isQuran}
          label={c.verdict === "wording_differs" ? "لفظ الحديث في المصدر" : c.verdict === "disputed" ? "قول منقول من المصدر (دون ترجيح)" : isQuran ? "نص الآية من المصحف" : "نص منقول من المصدر"}
        />
      ))}

      {c.authentic_alternative && !isQuran && (
        <div className="rounded-xl border border-ok/40 bg-ok/10 p-4">
          <p className="mb-2 text-sm font-medium text-ok">البديل الصحيح</p>
          <blockquote className="font-quote text-[1.375rem] leading-[2.2] text-offwhite" lang="ar">
            «{c.authentic_alternative.text}»
          </blockquote>
          <p className="mt-1 text-sm text-line">[{c.authentic_alternative.location}]</p>
        </div>
      )}

      {c.generated_note && c.verdict !== "not_a_religious_claim" && <GeneratedNote text={c.generated_note} />}
    </article>
  );
}
