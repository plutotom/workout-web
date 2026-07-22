import { z } from "zod";

import {
  curatedCatalogForPrompt,
  formatCatalogForPrompt,
  templateExerciseSchema,
  type CatalogExercise,
} from "./template-draft";

export { curatedCatalogForPrompt, formatCatalogForPrompt };
export type { CatalogExercise };

/**
 * Session AI draft: removals from the current session + new exercises to add.
 * User confirms both on the review sheet before anything is applied.
 */
export const sessionDraftSchema = z.object({
  removeSlugs: z
    .array(z.string().min(1).max(64))
    .max(40)
    .describe(
      "Existing session exercise slugs to remove. Empty if the user only wants additions.",
    ),
  add: z
    .array(templateExerciseSchema)
    .max(20)
    .describe(
      "New exercises to add. Empty if the user only wants removals. Do not include slugs that will remain in the session.",
    ),
});

export type SessionDraft = z.infer<typeof sessionDraftSchema>;

/**
 * Ground removals to slugs actually in the session; ground adds to catalog.
 * Adds may reuse a slug that is being removed in the same draft.
 */
export function groundSessionDraft(
  draft: SessionDraft,
  allowedSlugs: Set<string>,
  existingSlugs: Set<string>,
): { draft: SessionDraft; droppedSlugs: string[] } {
  const droppedSlugs: string[] = [];

  const removeSeen = new Set<string>();
  const removeSlugs: string[] = [];
  for (const raw of draft.removeSlugs) {
    const slug = raw.trim();
    if (!slug || removeSeen.has(slug)) continue;
    removeSeen.add(slug);
    if (!existingSlugs.has(slug)) {
      droppedSlugs.push(slug);
      continue;
    }
    removeSlugs.push(slug);
  }

  const stillInSession = new Set(
    [...existingSlugs].filter((s) => !removeSlugs.includes(s)),
  );

  const addSeen = new Set<string>();
  const add: SessionDraft["add"] = [];
  for (const ex of draft.add) {
    const slug = ex.slug.trim();
    if (
      !allowedSlugs.has(slug) ||
      stillInSession.has(slug) ||
      addSeen.has(slug)
    ) {
      droppedSlugs.push(slug);
      continue;
    }
    addSeen.add(slug);

    const sets = ex.sets.slice(0, 20).map((s) => ({
      weight: Math.max(0, Math.round(s.weight)),
      reps: Math.max(0, Math.round(s.reps)),
    }));
    add.push({
      slug,
      sets: sets.length ? sets : [{ weight: 0, reps: 0 }],
    });
  }

  return {
    draft: { removeSlugs, add },
    droppedSlugs,
  };
}

export const SESSION_GENERATE_SYSTEM_PROMPT = `You reshape an in-progress workout. The user will review before anything changes.

Output:
- removeSlugs: exercises to take out of the current session (use exact slugs from the session list)
- add: new exercises to insert (catalog slugs only, with set presets)

Rules:
- Follow the user's request. If they ask to remove or replace lifts, do it.
- Use ONLY catalog slugs for add. Use ONLY current-session slugs for removeSlugs.
- Do not put a slug in both "still kept" and add — if it stays, leave it out of add; if replacing, remove then add.
- If they do not specify weights/reps, use weight 0 and reps 0.
- Expand "3x10" into that many set rows.
- Prefer 1–12 adds unless they ask for more. Removals: only what they asked for (or what a clear rewrite requires).
- No cardio machines, stretching-only, or warm-up fluff unless asked.
- Empty session → only add. Pure cleanup → only removeSlugs.`;
