import { z } from "zod";

import { EXERCISES, type Exercise, type MuscleGroup } from "../exercises";

/**
 * Model output numbers for set presets.
 * Keep this a plain `z.number()` so the JSON Schema stays OpenAI-strict
 * (no preprocess / optional / default footguns). Grounding rounds values.
 */
export const templateSetSchema = z.object({
  weight: z
    .number()
    .finite()
    .min(0)
    .describe(
      "Target weight preset as a number. Prefer whole numbers; use 0 when unknown.",
    ),
  reps: z
    .number()
    .finite()
    .min(0)
    .describe(
      "Target reps preset as a number. Prefer whole numbers; use 0 when unknown.",
    ),
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
export function formatCatalogForPrompt(
  exercises: CatalogExercise[],
  style: "full" | "compact" = "full",
): string {
  return exercises
    .map((e) =>
      style === "compact"
        ? `${e.slug} | ${e.name}`
        : `${e.slug} | ${e.name} | ${e.category}`,
    )
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
 * High-signal curated lifts. Kept small so structured-output models (esp.
 * nano) can finish a valid JSON object instead of choking on a 280+ line catalog.
 */
const PRIORITY_SLUGS = [
  "bench",
  "db-bench",
  "incline-bench-bb",
  "incline-db-press",
  "chest-fly-db",
  "cable-fly",
  "pushup",
  "dips",
  "squat",
  "front-squat",
  "goblet-squat",
  "leg-press",
  "bulgarian-split-squat",
  "lunge",
  "rdl",
  "deadlift",
  "sumo-deadlift",
  "leg-curl",
  "leg-extension",
  "calf-raise",
  "ohp",
  "db-shoulder-press",
  "lateral-raise",
  "face-pull",
  "rear-delt-fly",
  "pullup",
  "chinup",
  "lat-pulldown",
  "barbell-row",
  "db-row",
  "seated-cable-row",
  "shrug",
  "barbell-curl",
  "bicep-curl",
  "hammer-curl",
  "tricep-pushdown",
  "skullcrusher",
  "overhead-tricep-ext",
  "plank",
  "hanging-leg-raise",
  "cable-crunch",
  "ab-wheel",
] as const;

const PER_CATEGORY_CAP = 14;
/** Compact catalog cap for cloud models (Gateway). */
export const PROMPT_CATALOG_MAX = 96;
/**
 * Tighter cap for Apple on-device (4k context). Priority lifts plus prompt
 * matches still fit; the full 96-line dump spends ~1.2k tokens.
 */
export const ON_DEVICE_PROMPT_CATALOG_MAX = 48;

function tokenizeForCatalogMatch(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/**
 * Build a compact catalog for the model prompt while grounding can still use
 * the full exercise list. Always includes customs + any `mustInclude` slugs
 * (e.g. current session lifts), then priority compounds, prompt matches, and
 * a per-category fill up to a hard cap.
 */
export function selectCatalogForAiPrompt(options: {
  customs?: CatalogExercise[];
  mustIncludeSlugs?: Iterable<string>;
  prompt?: string;
  max?: number;
}): CatalogExercise[] {
  const max = options.max ?? PROMPT_CATALOG_MAX;
  const full = curatedCatalogForPrompt();
  const bySlug = new Map(full.map((e) => [e.slug, e]));
  for (const custom of options.customs ?? []) {
    bySlug.set(custom.slug, custom);
  }

  const selected = new Map<string, CatalogExercise>();
  const add = (slug: string) => {
    if (selected.has(slug) || selected.size >= max) return;
    const exercise = bySlug.get(slug);
    if (exercise) selected.set(slug, exercise);
  };

  for (const slug of options.mustIncludeSlugs ?? []) add(slug);
  for (const custom of options.customs ?? []) add(custom.slug);
  for (const slug of PRIORITY_SLUGS) add(slug);

  const tokens = tokenizeForCatalogMatch(options.prompt ?? "");
  if (tokens.length > 0) {
    for (const exercise of bySlug.values()) {
      if (selected.size >= max) break;
      const hay = `${exercise.slug} ${exercise.name}`.toLowerCase();
      if (tokens.some((t) => hay.includes(t))) add(exercise.slug);
    }
  }

  const perCategory = new Map<MuscleGroup, number>();
  for (const exercise of selected.values()) {
    perCategory.set(
      exercise.category,
      (perCategory.get(exercise.category) ?? 0) + 1,
    );
  }

  for (const exercise of full) {
    if (selected.size >= max) break;
    const count = perCategory.get(exercise.category) ?? 0;
    if (count >= PER_CATEGORY_CAP) continue;
    add(exercise.slug);
    if (selected.has(exercise.slug)) {
      perCategory.set(exercise.category, count + 1);
    }
  }

  return [...selected.values()];
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
