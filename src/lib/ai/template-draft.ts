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
    .describe(
      "One object per working set row. Default to 3 identical rows when the user does not specify a count. Expand 4x8 into 4 rows. Never output a single row unless they asked for 1 set.",
    ),
});

export const templateDraftSchema = z.object({
  name: z.string().min(1).max(80).describe("Short workout template name."),
  exercises: z
    .array(templateExerciseSchema)
    .min(1)
    .max(20)
    .describe(
      "Ordered exercises for this single workout template. If the user named N lifts, this array must contain all N — do not stop at 3.",
    ),
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
  const stop = new Set([
    "and",
    "the",
    "with",
    "for",
    "day",
    "plus",
    "then",
    "add",
    "include",
  ]);
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t));
}

/**
 * Build a compact catalog for the model prompt while grounding can still use
 * the full exercise list. Always includes customs + any `mustInclude` slugs
 * (e.g. current session lifts), then prompt-named lifts, priority compounds,
 * and a per-category fill up to a hard cap.
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

  // Named lifts before filler. On-device caps at 48; 42 priority slugs
  // used to crowd out later items in a 5–6 exercise list.
  const tokens = tokenizeForCatalogMatch(options.prompt ?? "");
  if (tokens.length > 0) {
    for (const exercise of bySlug.values()) {
      if (selected.size >= max) break;
      const hay = `${exercise.slug} ${exercise.name}`.toLowerCase();
      if (tokens.some((t) => hay.includes(t))) add(exercise.slug);
    }
  }

  for (const slug of PRIORITY_SLUGS) add(slug);

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

export const DEFAULT_WORKING_SET_COUNT = 3;

export function defaultWorkingSets(
  count = DEFAULT_WORKING_SET_COUNT,
  seed: { weight: number; reps: number } = { weight: 0, reps: 0 },
): { weight: number; reps: number }[] {
  const n = Math.min(20, Math.max(1, count));
  return Array.from({ length: n }, () => ({
    weight: seed.weight,
    reps: seed.reps,
  }));
}

/** 4x8 → 4, "3 sets" → 3. Mixed NxM counts or no mention → default 3. */
export function inferWorkingSetCount(prompt: string): number {
  if (/\b(single(\s+set)?s?|singles|one\s+set|1\s+set)\b/i.test(prompt)) {
    return 1;
  }
  const matches = [...prompt.matchAll(/(\d+)\s*[x×]\s*\d+/gi)];
  const counts = [...new Set(matches.map((match) => Number(match[1])))].filter(
    (n) => n >= 1 && n <= 20,
  );
  if (counts.length === 1) return counts[0]!;
  const named = prompt.match(/\b(\d+)\s*sets?\b/i);
  if (named) {
    const n = Number(named[1]);
    if (n >= 1 && n <= 20) return n;
  }
  return DEFAULT_WORKING_SET_COUNT;
}

export function padExerciseSets<
  T extends { sets: { weight: number; reps: number }[] },
>(exercises: T[], prompt: string): T[] {
  const target = inferWorkingSetCount(prompt);
  return exercises.map((exercise) => {
    if (exercise.sets.length >= target) return exercise;
    const seed = exercise.sets[0] ?? { weight: 0, reps: 0 };
    return { ...exercise, sets: defaultWorkingSets(target, seed) };
  });
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
      sets: sets.length ? sets : defaultWorkingSets(),
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

/** Spoken / typed names → catalog slug (word-boundary matches in the prompt). */
const PROMPT_STANDALONE_PATTERNS: { pattern: RegExp; slug: string }[] = [
  { pattern: /\bsquats?\b/i, slug: "squat" },
  { pattern: /\bbench\b/i, slug: "bench" },
  { pattern: /\bpull[- ]?ups?\b/i, slug: "pullup" },
  { pattern: /\bchin[- ]?ups?\b/i, slug: "chinup" },
  { pattern: /\bromanian\s+deadlifts?\b/i, slug: "rdl" },
  { pattern: /\bdeadlifts?\b/i, slug: "deadlift" },
  { pattern: /\brdls?\b/i, slug: "rdl" },
  { pattern: /\b(?:overhead|military)\s+press(?:es)?\b/i, slug: "ohp" },
  { pattern: /\bohps?\b/i, slug: "ohp" },
  { pattern: /\bdips?\b/i, slug: "dips" },
  { pattern: /\bpush[- ]?ups?\b/i, slug: "pushup" },
  { pattern: /\brear\s+delt(?:\s+fly)?\b/i, slug: "rear-delt-fly" },
  { pattern: /\bcable\s+fly\b/i, slug: "cable-fly" },
  {
    pattern: /\bchest\s+fly\b|\bflies\b|(?<!cable\s)\bfly\b/i,
    slug: "chest-fly-db",
  },
  { pattern: /\blaterals?\b|\blateral\s+raises?\b/i, slug: "lateral-raise" },
  { pattern: /\b(?:lat\s+)?pulldowns?\b/i, slug: "lat-pulldown" },
  { pattern: /\bhip\s+thrusts?\b/i, slug: "hip-thrust" },
  { pattern: /\bface\s+pulls?\b/i, slug: "face-pull" },
  { pattern: /\blunges?\b/i, slug: "lunge" },
  { pattern: /\bleg\s+press(?:es)?\b/i, slug: "leg-press" },
];

/** Phrase-level aliases (normalized lowercase) before fuzzy catalog scan. */
const PROMPT_EXERCISE_ALIASES: Record<string, string> = {
  squat: "squat",
  squats: "squat",
  bench: "bench",
  "bench press": "bench",
  "pull up": "pullup",
  "pull ups": "pullup",
  pullup: "pullup",
  pullups: "pullup",
  "pull-up": "pullup",
  "pull-ups": "pullup",
  "chin up": "chinup",
  "chin ups": "chinup",
  fly: "chest-fly-db",
  flies: "chest-fly-db",
  "chest fly": "chest-fly-db",
  "db fly": "chest-fly-db",
  "dumbbell fly": "chest-fly-db",
  "cable fly": "cable-fly",
  row: "barbell-row",
  rows: "barbell-row",
  "barbell row": "barbell-row",
  "db row": "db-row",
  "dumbbell row": "db-row",
  curl: "barbell-curl",
  curls: "barbell-curl",
  "bicep curl": "bicep-curl",
  "bicep curls": "bicep-curl",
  laterals: "lateral-raise",
  "lateral raise": "lateral-raise",
  "lateral raises": "lateral-raise",
  pulldown: "lat-pulldown",
  pulldowns: "lat-pulldown",
  "lat pulldown": "lat-pulldown",
  "hip thrust": "hip-thrust",
  "hip thrusts": "hip-thrust",
  "face pull": "face-pull",
  "face pulls": "face-pull",
  lunge: "lunge",
  lunges: "lunge",
  "leg press": "leg-press",
  "overhead press": "ohp",
  "military press": "ohp",
  rdl: "rdl",
  rdls: "rdl",
  "romanian deadlift": "rdl",
};

function normalizePromptPhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(do|add|include|with)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogHasSlug(slug: string, catalog: CatalogExercise[]): boolean {
  return catalog.some((exercise) => exercise.slug === slug);
}

function resolvePromptAlias(
  phrase: string,
  catalog: CatalogExercise[],
): string | null {
  const mapped = PROMPT_EXERCISE_ALIASES[normalizePromptPhrase(phrase)];
  if (mapped && catalogHasSlug(mapped, catalog)) return mapped;
  return null;
}

function matchPhraseToCatalogSlug(
  phrase: string,
  catalog: CatalogExercise[],
): string | null {
  const alias = resolvePromptAlias(phrase, catalog);
  if (alias) return alias;

  const norm = normalizePromptPhrase(phrase);
  if (!norm) return null;

  const hyphenSlug = norm.replace(/\s+/g, "-");
  if (catalogHasSlug(hyphenSlug, catalog)) return hyphenSlug;

  const compact = norm.replace(/[^a-z0-9]/g, "");
  const byCompact = catalog.find(
    (exercise) => exercise.slug.replace(/-/g, "") === compact,
  );
  if (byCompact) return byCompact.slug;

  const byName = catalog.find(
    (exercise) =>
      exercise.name.toLowerCase() === norm ||
      exercise.name.toLowerCase().startsWith(`${norm} `),
  );
  if (byName) return byName.slug;

  const words = norm.split(/\s+/).filter((word) => word.length >= 3);
  if (words.length === 0) return null;

  const candidates = catalog.filter((exercise) => {
    const hay = `${exercise.slug} ${exercise.name}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  });
  if (candidates.length === 1) return candidates[0]!.slug;
  if (candidates.length > 1) {
    for (const slug of PRIORITY_SLUGS) {
      if (candidates.some((exercise) => exercise.slug === slug)) return slug;
    }
    return candidates[0]!.slug;
  }
  return null;
}

function extractListPhrases(prompt: string): string[] {
  return prompt
    .split(/\s*(?:,|&|\band\b|\bplus\b|\bthen\b|\n|;|\d+[.)]\s+|[-•*]\s+)\s*/i)
    .map((part) => part.replace(/^(?:\d+[.)]\s*|[-•*]\s+)/, "").trim())
    .filter((part) => part.length > 0 && part.length <= 60);
}

/**
 * Slugs the user likely named in plain language. Used to pin the prompt catalog
 * and to merge missing lifts after generation (on-device models often stop at ~3).
 */
export function detectRequiredExerciseSlugs(
  prompt: string,
  catalog: CatalogExercise[],
): string[] {
  const found = new Set<string>();
  const order: string[] = [];
  const add = (slug: string | null) => {
    if (!slug || !catalogHasSlug(slug, catalog) || found.has(slug)) return;
    found.add(slug);
    order.push(slug);
  };

  for (const { pattern, slug } of PROMPT_STANDALONE_PATTERNS) {
    if (pattern.test(prompt)) add(slug);
  }
  for (const phrase of extractListPhrases(prompt)) {
    add(matchPhraseToCatalogSlug(phrase, catalog));
  }
  return order;
}

/** User gave a concrete list (comma / “and” / newlines) or named 3+ movements. */
export function isExplicitExerciseList(
  prompt: string,
  requiredCount: number,
): boolean {
  return requiredCount >= 3 || /,|\band\b|\n|\d+[.)]/.test(prompt);
}

export function formatRequiredExercisesPromptBlock(
  slugs: string[],
  catalog: CatalogExercise[],
): string | null {
  if (slugs.length === 0) return null;
  const bySlug = new Map(catalog.map((exercise) => [exercise.slug, exercise]));
  const lines = slugs.map((slug) => {
    const exercise = bySlug.get(slug);
    return exercise ? `- ${slug} (${exercise.name})` : `- ${slug}`;
  });
  return `Required exercises (include EVERY slug below as its own exercise, with 3 set rows unless the user specified another count):\n${lines.join("\n")}`;
}

/**
 * Ensures named exercises appear in the draft. In strict list mode (3+ named
 * lifts or comma/“and” phrasing), output is exactly those slugs in order.
 */
export function applyRequiredExercisesToTemplate(
  draft: TemplateDraft,
  requiredSlugs: string[],
  options?: { strictList?: boolean },
): TemplateDraft {
  if (requiredSlugs.length === 0) return draft;

  const bySlug = new Map(
    draft.exercises.map((exercise) => [exercise.slug, exercise]),
  );

  if (options?.strictList && requiredSlugs.length >= 3) {
    return {
      ...draft,
      exercises: requiredSlugs.map(
        (slug) => bySlug.get(slug) ?? { slug, sets: defaultWorkingSets() },
      ),
    };
  }

  const requiredSet = new Set(requiredSlugs);
  const merged = [...draft.exercises];
  for (const slug of requiredSlugs) {
    if (!bySlug.has(slug)) {
      merged.push({ slug, sets: defaultWorkingSets() });
    }
  }
  const requiredPart = requiredSlugs
    .map((slug) => merged.find((exercise) => exercise.slug === slug))
    .filter((exercise): exercise is TemplateDraft["exercises"][number] =>
      Boolean(exercise),
    );
  const rest = merged.filter((exercise) => !requiredSet.has(exercise.slug));
  return { ...draft, exercises: [...requiredPart, ...rest] };
}

export const GENERATE_SYSTEM_PROMPT = `You build strength-training workout templates for a lifting tracker.

Rules:
- Output ONE workout template (not a multi-day program).
- Use ONLY exercise slugs from the catalog. Never invent slugs or names.
- If the user names specific exercises or movements, include EVERY one (match to the closest catalog slug). Do not omit any named lift.
- When the user gives an explicit list of N lifts, the exercises array MUST contain all N items. Never stop at 3 if they named more.
- If they describe a session type without naming lifts (e.g. "push day"), use 5–7 exercises with common compound + accessory balance.
- Each exercise MUST have 3 set rows unless the user specified a different count (4x8 → 4 rows of 8 reps, 5x5 → 5 rows). Never emit a single set unless they asked for 1 set.
- Repeat the same weight and reps on every row when they do not vary.
- If the user does not specify weights or reps, use weight 0 and reps 0 (meaning "no preset") on every set row.
- Do not include cardio machines, stretching-only work, or warm-up fluff unless asked.
- Name should be short and specific (e.g. "Push Day", "Upper Power").`;
