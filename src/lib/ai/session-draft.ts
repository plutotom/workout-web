import { z } from "zod";

import {
  curatedCatalogForPrompt,
  defaultWorkingSets,
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
      "Existing session exercise slugs to remove. Use [] if the user only wants additions.",
    ),
  add: z
    .array(templateExerciseSchema)
    .max(20)
    .describe(
      "New exercises to add. Use [] if the user only wants removals. Do not include slugs that will remain in the session.",
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
      sets: sets.length ? sets : defaultWorkingSets(),
    });
  }

  return {
    draft: { removeSlugs, add },
    droppedSlugs,
  };
}

/**
 * Ensures named lifts show up in `add` when they are not already in the session
 * (or are being removed). On-device models often stop after ~3 adds.
 */
export function applyRequiredExercisesToSession(
  draft: SessionDraft,
  requiredSlugs: string[],
  existingSlugs: Set<string>,
  options?: { strictList?: boolean },
): SessionDraft {
  if (requiredSlugs.length === 0) return draft;

  const remaining = new Set(
    [...existingSlugs].filter((slug) => !draft.removeSlugs.includes(slug)),
  );
  const needed = requiredSlugs.filter(
    (slug) => !remaining.has(slug) && !draft.removeSlugs.includes(slug),
  );
  if (needed.length === 0) return draft;

  const bySlug = new Map(
    draft.add.map((exercise) => [exercise.slug, exercise]),
  );
  if (options?.strictList && needed.length >= 3) {
    return {
      ...draft,
      add: needed.map(
        (slug) => bySlug.get(slug) ?? { slug, sets: defaultWorkingSets() },
      ),
    };
  }

  const merged = [...draft.add];
  for (const slug of needed) {
    if (!bySlug.has(slug)) {
      merged.push({ slug, sets: defaultWorkingSets() });
    }
  }
  return { ...draft, add: merged };
}

export const SESSION_GENERATE_SYSTEM_PROMPT = `You reshape an in-progress workout. The user will review before anything changes.

Output:
- removeSlugs: exercises to take out of the current session (use exact slugs from the session list)
- add: new exercises to insert (catalog slugs only, with set presets)

Rules:
- Follow the user's request. If they ask to remove or replace lifts, do it.
- Use ONLY catalog slugs for add. Use ONLY current-session slugs for removeSlugs.
- Do not put a slug in both "still kept" and add — if it stays, leave it out of add; if replacing, remove then add.
- If the user names N lifts to add, add MUST contain all N. Never stop at 3 if they named more.
- Each added exercise MUST have 3 set rows unless the user specified a different count (4x8 → 4 rows). Never emit a single set unless they asked for 1 set.
- Repeat the same weight and reps on every row when they do not vary.
- If they do not specify weights/reps, use weight 0 and reps 0 on every set row.
- Prefer 1–12 adds unless they ask for more. Removals: only what they asked for (or what a clear rewrite requires).
- No cardio machines, stretching-only, or warm-up fluff unless asked.
- Empty session → only add. Pure cleanup → only removeSlugs.`;
