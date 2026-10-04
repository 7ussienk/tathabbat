import { z } from "zod";

export const CuratedSourceSchema = z
  .object({
    source_id: z.string(),
    location: z.string(),
    url: z.string().optional(),
    grading_quote: z.string().optional(),
    quoted_text: z.string().optional(),
    attribution_note: z.string().optional(),
  })
  .passthrough();

/** مدخل data/curated/widespread.jsonl (حكم بشري منقول؛ يسبق الفهرس المحلي). */
export const CuratedEntrySchema = z
  .object({
    id: z.string(),
    claim_text: z.string(),
    claim_type: z.string(),
    level: z.enum(["A", "B", "C", "D"]),
    verdict: z.string(),
    also_judged_as: z.array(z.string()).optional(),
    sources: z.array(CuratedSourceSchema),
    aliases: z.array(z.string()).optional(),
    authentic_alternative: z.object({ text: z.string(), source_id: z.string(), location: z.string(), url: z.string().optional() }).optional(),
    reviewed: z.boolean(),
    machine_verified: z.string().optional(),
  })
  .passthrough();

export type CuratedEntry = z.infer<typeof CuratedEntrySchema>;
