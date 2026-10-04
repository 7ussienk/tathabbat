import { z } from "zod";

export const SOURCE_TYPES = [
  "hadith_collection",
  "widespread_hadith_verdicts",
  "fabricated_list",
  "narrator_criticism",
  "hadith_takhrij",
  "hadith_commentary",
  "hadith_methodology",
  "quran",
  "remote_service",
  "external_link_only",
] as const;

export const ManifestEntrySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    author: z.string().optional(),
    madhhab: z.string().optional(),
    type: z.enum(SOURCE_TYPES),
    edition: z.string().optional(),
    shamela_book_id: z.number().int().positive().nullish(),
    turath_book_id: z.number().int().positive().nullish(),
    origin_url: z.string(),
    license: z.string(),
    added_by: z.string(),
    reviewed: z.boolean(),
    deep_lookup_allowed: z.boolean().optional(),
  })
  .passthrough();

export const ManifestSchema = z.array(ManifestEntrySchema);

export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
