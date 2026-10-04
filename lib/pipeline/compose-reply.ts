import type { Store } from "@/lib/retrieval/store";
import type { ClaimResult, SourceRef, Verdict } from "@/lib/schemas/claim";
import { VERDICT_LABELS } from "@/lib/verdict-labels";

export const DISCLAIMER = "أداة ذكاء اصطناعي للمساعدة في التحقق، وليست مفتياً.";
export const RULING_NOTE = "هذا حكم على الرواية لا على العمل أو المسألة؛ للفتوى راجع جهة مؤهلة.";
const OPENING = "جزاك الله خيراً على حرصك على التثبّت قبل النشر.";
export const TELEGRAM_LIMIT = 4096;

const NARRATION: Verdict[] = ["authentic", "weak", "fabricated", "no_basis_per_scholar", "disputed", "misattributed", "scholar_text_only"];

/** «السخاوي (ت 902هـ)» ← «السخاوي» */
const authorName = (a?: string) => a?.replace(/\s*\([^)]*\)\s*$/, "").trim();

function sourceLine(s: SourceRef, store: Store | null, full: boolean): string {
  const meta = store?.sourceMeta[s.source_id];
  const who = authorName(meta?.author);
  const head = `جاء في «${s.title}»${who ? ` (${who})` : ""} [${s.location}]:`;
  const quote = s.grading_quote ?? s.quoted_text;
  const body = full || quote.length <= 400 ? quote : `${quote.slice(0, 400)}…`;
  const note = s.attribution_note ? `\n  (${s.attribution_note})` : "";
  const link = s.url ? `\n  ${s.url}` : "";
  return `${head}\n  «${body}»${note}${link}`;
}

function claimBlock(c: ClaimResult, store: Store | null, compact: boolean): string {
  const lines: string[] = [`• «${c.claim_text}»`];
  const lab = VERDICT_LABELS[c.verdict].label;
  switch (c.verdict) {
    case "refer_to_scholar":
      lines.push("  هذا سؤال يخص حالة شخصية أو فتوى؛ لا تُفتي هذه الأداة. اسأل عالماً أو جهة إفتاء رسمية.");
      break;
    case "not_a_religious_claim":
      lines.push("  لا يوجد ادعاء ديني للتحقق منه في هذا النص.");
      break;
    case "search_unavailable":
      lines.push("  تعذّر البحث في المصادر الآن، ولذلك لا نستطيع الجزم بشيء. حاول بعد قليل.");
      break;
    case "not_found_in_sources": {
      const titles = (c.checked_sources ?? []).map((id) => store?.sourceMeta[id]?.title ?? id);
      lines.push(
        `  لم نجد له أصلاً في المصادر المعتمدة التي فُحصت${titles.length ? ` (${titles.join("، ")})` : ""}.`,
        "  وهذه المصادر لا تغطي كل كتب القائمة المعتمدة، فليس هذا حكماً شرعياً على النص؛ يمكنك التحقق بنفسك:",
        `  ${c.verify_link}`,
      );
      break;
    }
    case "wording_differs":
      // لفظ المصدر حرفياً مع موضعه، وتنبيه أنه قد يكون رواية أخرى؛ لا «الحكم المنقول» ولا وصف بالخطأ (قرار 4 أكتوبر)
      for (const s of c.sources) {
        const who = authorName(store?.sourceMeta[s.source_id]?.author);
        const q = compact && s.quoted_text.length > 400 ? `${s.quoted_text.slice(0, 400)}…` : s.quoted_text;
        lines.push(`  لفظ الحديث في «${s.title}»${who ? ` (${who})` : ""}: «${q}» (${s.location})`);
        if (s.url) lines.push(`  ${s.url}`);
      }
      if (c.system_note) lines.push(`  ${c.system_note}`);
      lines.push("  تنبيه: قد يكون هذا روايةً أخرى للحديث؛ لا نصف ما وصلك بالخطأ ولا بالكذب، لكننا لا نحكم عليه بلفظه هذا.");
      if (c.review_status === "pending_review") lines.push("  (بانتظار مراجعة شرعية)");
      break;
    case "quran_verified":
      lines.push(`  ${lab} (${c.sources[0]?.location}):`, `  «${c.sources[0]?.quoted_text}»`);
      break;
    case "quran_misquoted":
      lines.push(`  ${lab} (${c.sources[0]?.location}):`, `  «${c.sources[0]?.quoted_text}»`);
      break;
    default:
      lines.push(`  الحكم المنقول: ${lab}`);
      for (const s of c.sources) lines.push(`  ${sourceLine(s, store, !compact)}`);
      if (c.authentic_alternative) {
        lines.push(`  البديل الصحيح: «${c.authentic_alternative.text}» [${c.authentic_alternative.location}]`);
      }
      if (c.review_status === "pending_review") lines.push("  (بانتظار مراجعة شرعية)");
  }
  return lines.join("\n");
}

/** الخطوة 7: رد جاهز للمشاركة يُبنى بقوالب ثابتة من الأحكام المنقولة (لا توليد، القاعدتان 15 و21). */
export function composeReply(claims: ClaimResult[], store: Store | null): { reply_text: string; telegram_text: string } {
  const build = (compact: boolean) => {
    const parts = [OPENING, "", ...claims.map((c) => claimBlock(c, store, compact))];
    if (claims.some((c) => NARRATION.includes(c.verdict))) parts.push("", RULING_NOTE);
    parts.push("", DISCLAIMER);
    return parts.join("\n");
  };
  const reply_text = build(false);
  let telegram_text = reply_text;
  if (telegram_text.length > TELEGRAM_LIMIT) telegram_text = build(true);
  if (telegram_text.length > TELEGRAM_LIMIT) {
    const tail = `…

${DISCLAIMER}`;
    telegram_text = `${telegram_text.slice(0, TELEGRAM_LIMIT - tail.length).trimEnd()}${tail}`;
  }
  return { reply_text, telegram_text };
}
