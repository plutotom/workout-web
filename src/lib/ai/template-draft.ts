import { z } from "zod";

import { EXERCISES, type Exercise } from "../exercises";

export const templateSetSchema = z.object({
  weight: z
    .number()
    .int()
    .min(0)
    .describe("Target weight preset. Use 0 when unknown or not specified."),
  reps: z
    .number()
    .int()
    .min(0)
    .describe("Target reps preset. Use 0 when unknown or not specified."),
});

export const templateExerciseSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .describe("Must be an exact slug from the provided exercise catalog."),
  sets: z
    .array(templateSetSchema)
    .min(1)
    .max(20)
    .describe("Per-set weight/reps presets. Prefer 3–5 working sets."),
});

export const templateDraftSchema = z.object({
  name: z.string().min(1).max(80).describe("Short workout template name."),
  exercises: z
    .array(templateExerciseSchema)
    .min(1)
    .max(20)
    .describe("Ordered exercises for this single workout template."),
});

export type TemplateDraft = z.infer<typeof templateDraftSchema>;

export type CatalogExercise = Pick<Exercise, "slug" | "name" | "category">;

/** Compact catalog lines for the model prompt. */
export function formatCatalogForPrompt(exercises: CatalogExercise[]): string {
  return exercises
    .map((e) => `${e.slug} | ${e.name} | ${e.category}`)
    .join("\n");
}

export function curatedCatalogForPrompt(): CatalogExercise[] {
  return EXERCISES.filter((e) => !e.archived).map((e) => ({
    slug: e.slug,
    name: e.name,
    category: e.category,
  }));
}

/**
 * Keep only known slugs (first wins), clamp sets, drop empties.
 * Returns grounded draft + list of dropped/unknown slugs.
 */
export function groundTemplateDraft(
  draft: TemplateDraft,
  allowedSlugs: Set<string>,
): { draft: TemplateDraft; droppedSlugs: string[] } {
  const seen = new Set<string>();
  const droppedSlugs: string[] = [];
  const exercises: TemplateDraft["exercises"] = [];

  for (const ex of draft.exercises) {
    const slug = ex.slug.trim();
    if (!allowedSlugs.has(slug)) {
      droppedSlugs.push(slug);
      continue;
    }
    if (seen.has(slug)) {
      droppedSlugs.push(slug);
      continue;
    }
    seen.add(slug);

    const sets = ex.sets.slice(0, 20).map((s) => ({
      weight: Math.max(0, Math.round(s.weight)),
      reps: Math.max(0, Math.round(s.reps)),
    }));
    exercises.push({
      slug,
      sets: sets.length ? sets : [{ weight: 0, reps: 0 }],
    });
  }

  return {
    draft: {
      name: draft.name.trim() || "Untitled",
      exercises,
    },
    droppedSlugs,
  };
}

export const GENERATE_SYSTEM_PROMPT = `You build strength-training workout templates for a lifting tracker.

Rules:
- Output ONE workout template (not a multi-day program).
- Use ONLY exercise slugs from the catalog. Never invent slugs or names.
- Prefer common compound + accessory balance for the described session.
- If the user does not specify weights or reps, use weight 0 and reps 0 (meaning "no preset").
- If they specify "3x10" style, expand into that many set rows with those reps (weight 0 unless given).
- Keep 3–12 exercises unless the user asks otherwise.
- Do not include cardio machines, stretching-only work, or warm-up fluff unless asked.
- Name should be short and specific (e.g. "Push Day", "Upper Power").`;
