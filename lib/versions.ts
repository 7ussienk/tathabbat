/**
 * أرقام نسخ المعجم والبرومتات. تُسجَّل مع كل نتيجة تقييم، وتُجمَّد قبل تشغيل مجموعة التحقق المستقلة
 * (docs/PHASE1_RESULTS.md). أي تعديل في lexicon أو في نص البرومتات يرفع الرقم.
 */
export const LEXICON_VERSION = "lexicon-2026-10-04.2";
export const PROMPT_VERSION = "prompts-2026-10-04.4";
export const VERSIONS = { lexicon: LEXICON_VERSION, prompts: PROMPT_VERSION } as const;
