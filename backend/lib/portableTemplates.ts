import type { Infer } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getNotesBySlugs } from "./exercise_notes";
import {
  customSlug,
  MAX_CUSTOM_EXERCISES_PER_USER,
  MAX_NAME_LENGTH,
  normalizeShort,
} from "./exercises";
import { createTemplate, type ExerciseInput } from "./templates";
import type { portableBundleValidator } from "../schemas/portable";

export type PortableBundle = Infer<typeof portableBundleValidator>;
export type PortableCustomExercise = PortableBundle["customExercises"][number];

const MAX_TEMPLATES_PER_IMPORT = 50;
const CUSTOM_SLUG_PREFIX = "custom:";
const LB_PER_KG = 2.2046226218;
/** See adoptOrphanCustom — only reached for bundles missing a lift definition. */
const ORPHAN_FALLBACK_CATEGORY = "chest" as const;

/** Sets carry no unit of their own, so a cross-unit import converts them. */
export function convertWeight(
  weight: number,
  from: "lb" | "kg",
  to: "lb" | "kg",
): number {
  if (from === to || weight === 0) return weight;
  const converted = from === "kg" ? weight * LB_PER_KG : weight / LB_PER_KG;
  return Math.round(converted);
}

/**
 * Everything needed to build a portable bundle, minus the exercise display
 * names — those come from the catalog, which lives client-side (see
 * `schemas/exercises.ts`). `src/lib/workout-export.ts` finishes the bundle.
 */
export async function collectTemplateExportData(
  ctx: QueryCtx,
  userId: Id<"users">,
  templateIds?: Id<"workoutTemplates">[],
) {
  const user = await ctx.db.get(userId);
  const all = await ctx.db
    .query("workoutTemplates")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const wanted = templateIds ? new Set<string>(templateIds) : null;
  const selected = wanted ? all.filter((t) => wanted.has(t._id)) : all;
  selected.sort((a, b) => b.updatedAt - a.updatedAt);

  const referencedSlugs = new Set<string>();
  const templates = await Promise.all(
    selected.map(async (template) => {
      const rows = await ctx.db
        .query("templateExercises")
        .withIndex("by_template", (q) => q.eq("templateId", template._id))
        .collect();
      rows.sort((a, b) => a.orderIndex - b.orderIndex);
      for (const row of rows) referencedSlugs.add(row.exerciseSlug);
      return {
        name: template.name,
        exercises: rows.map((row) => ({
          slug: row.exerciseSlug,
          sets: row.sets,
        })),
      };
    }),
  );

  const notesBySlug = await getNotesBySlugs(ctx, userId, [...referencedSlugs]);

  // Only the custom lifts these templates actually reference — no point
  // shipping the sender's whole custom catalog.
  const customs = await ctx.db
    .query("customExercises")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const customExercises = customs
    .filter((doc) => referencedSlugs.has(customSlug(doc._id)))
    .map((doc) => ({
      slug: customSlug(doc._id),
      name: doc.name,
      short: doc.short,
      category: doc.category,
      usesBar: doc.usesBar,
    }));

  return {
    unit: user?.unit ?? ("lb" as const),
    templates: templates.map((t) => ({
      name: t.name,
      exercises: t.exercises.map((e) => ({
        slug: e.slug,
        sets: e.sets,
        notes: notesBySlug[e.slug],
      })),
    })),
    customExercises,
  };
}

/**
 * Recreate the sender's custom lifts under the importer's account and return a
 * sender-slug → importer-slug map.
 *
 * An existing custom lift with the same name (case-insensitive) is reused
 * rather than duplicated, so importing the same bundle twice — or importing
 * from two friends who both bench — does not litter the catalog. Archived
 * matches are revived, since the importer is explicitly asking for that lift
 * back.
 */
async function remapCustomExercises(
  ctx: MutationCtx,
  userId: Id<"users">,
  incoming: readonly PortableCustomExercise[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (incoming.length === 0) return map;

  const existing = await ctx.db
    .query("customExercises")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const byName = new Map(
    existing.map((doc) => [doc.name.trim().toLowerCase(), doc]),
  );
  let count = existing.length;

  for (const entry of incoming) {
    // An imported name is untrusted input and must obey the same caps as one
    // typed into the app, so a hand-edited bundle can't smuggle in an
    // oversized name or blow past the per-user limit.
    const name = entry.name.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) continue;

    const match = byName.get(name.toLowerCase());
    if (match) {
      if (match.archived) await ctx.db.patch(match._id, { archived: false });
      map.set(entry.slug, customSlug(match._id));
      continue;
    }

    if (count >= MAX_CUSTOM_EXERCISES_PER_USER) {
      throw new Error(
        `This import would exceed the limit of ${MAX_CUSTOM_EXERCISES_PER_USER} custom exercises`,
      );
    }

    const id = await ctx.db.insert("customExercises", {
      userId,
      name,
      short: normalizeShort(entry.short),
      category: entry.category,
      usesBar: entry.usesBar,
      archived: false,
    });
    count++;
    const created = await ctx.db.get(id);
    if (created) byName.set(name.toLowerCase(), created);
    map.set(entry.slug, customSlug(id));
  }

  return map;
}

/**
 * Recreate an unknown `custom:` slug that arrived without a definition — e.g. a
 * hand-edited file, or a bundle from a client that omitted `customExercises`.
 * Falls back to the display name that travelled with the exercise.
 */
async function adoptOrphanCustom(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed || trimmed.startsWith(CUSTOM_SLUG_PREFIX)) return null;

  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await ctx.db
    .query("customExercises")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const match = existing.find((doc) => doc.name.trim().toLowerCase() === key);
  if (match) {
    if (match.archived) await ctx.db.patch(match._id, { archived: false });
    cache.set(key, customSlug(match._id));
    return customSlug(match._id);
  }

  if (existing.length >= MAX_CUSTOM_EXERCISES_PER_USER) {
    throw new Error(
      `This import would exceed the limit of ${MAX_CUSTOM_EXERCISES_PER_USER} custom exercises`,
    );
  }

  const id = await ctx.db.insert("customExercises", {
    userId,
    name: trimmed,
    // Placeholder — the bundle told us the name but not the muscle group. The
    // lift is fully usable and the user can recategorise it in the exercise
    // editor; guessing from the name would be worse than an obvious default.
    category: ORPHAN_FALLBACK_CATEGORY,
    usesBar: false,
    archived: false,
  });
  cache.set(key, customSlug(id));
  return customSlug(id);
}

/** `Push Day` + an existing `Push Day` becomes `Push Day (2)`. */
export function uniqueName(name: string, taken: Set<string>): string {
  const base = name.trim() || "Untitled";
  if (!taken.has(base.toLowerCase())) {
    taken.add(base.toLowerCase());
    return base;
  }
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
  return `${base} (${Date.now()})`;
}

export type ImportResult = {
  templateIds: Id<"workoutTemplates">[];
  templatesImported: number;
  customExercisesCreated: number;
  notesImported: number;
  names: string[];
};

/**
 * Write a portable bundle into the importer's account as new templates. Never
 * overwrites: existing templates are left alone and name collisions are
 * suffixed, so an import can always be undone by deleting what it added.
 */
export async function importBundle(
  ctx: MutationCtx,
  userId: Id<"users">,
  bundle: PortableBundle,
  options: { includeNotes?: boolean } = {},
): Promise<ImportResult> {
  const { includeNotes = true } = options;

  if (bundle.templates.length === 0) {
    throw new Error("This export contains no templates");
  }
  if (bundle.templates.length > MAX_TEMPLATES_PER_IMPORT) {
    throw new Error(
      `Imports are limited to ${MAX_TEMPLATES_PER_IMPORT} templates at a time`,
    );
  }

  const user = await ctx.db.get(userId);
  const targetUnit = user?.unit ?? "lb";

  const customsBefore = await ctx.db
    .query("customExercises")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const slugMap = await remapCustomExercises(
    ctx,
    userId,
    bundle.customExercises,
  );
  const orphanCache = new Map<string, string>();

  const existingTemplates = await ctx.db
    .query("workoutTemplates")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const takenNames = new Set(
    existingTemplates.map((t) => t.name.trim().toLowerCase()),
  );

  const templateIds: Id<"workoutTemplates">[] = [];
  const names: string[] = [];
  const notesToWrite = new Map<string, string>();

  for (const template of bundle.templates) {
    const exercises: ExerciseInput[] = [];

    for (const exercise of template.exercises) {
      let slug = exercise.slug.trim();
      if (!slug) continue;

      if (slug.startsWith(CUSTOM_SLUG_PREFIX)) {
        const mapped =
          slugMap.get(slug) ??
          (await adoptOrphanCustom(ctx, userId, exercise.name, orphanCache));
        // A custom lift we can neither map nor name is unusable — drop it
        // rather than import a slug that renders as raw `custom:<id>`.
        if (!mapped) continue;
        slug = mapped;
      }

      exercises.push({
        slug,
        sets: exercise.sets.map((set) => ({
          weight: convertWeight(set.weight, bundle.unit, targetUnit),
          reps: set.reps,
        })),
      });

      const note = exercise.notes?.trim();
      if (includeNotes && note) notesToWrite.set(slug, note);
    }

    if (exercises.length === 0) continue;

    const name = uniqueName(template.name, takenNames);
    const templateId = await createTemplate(ctx, userId, { name, exercises });
    templateIds.push(templateId);
    names.push(name);
  }

  if (templateIds.length === 0) {
    throw new Error("This export contains no usable exercises");
  }

  // Notes are keyed by slug and shared across the importer's own templates and
  // workouts, so an import only fills gaps — it never overwrites a note the
  // importer already wrote for that lift.
  let notesImported = 0;
  if (includeNotes && notesToWrite.size > 0) {
    for (const [slug, notes] of notesToWrite) {
      const existing = await ctx.db
        .query("exerciseNotes")
        .withIndex("by_user_slug", (q) =>
          q.eq("userId", userId).eq("exerciseSlug", slug),
        )
        .unique();
      if (existing) continue;
      await ctx.db.insert("exerciseNotes", {
        userId,
        exerciseSlug: slug,
        notes: notes.slice(0, 500),
      });
      notesImported++;
    }
  }

  const customsAfter = await ctx.db
    .query("customExercises")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return {
    templateIds,
    templatesImported: templateIds.length,
    customExercisesCreated: customsAfter.length - customsBefore.length,
    notesImported,
    names,
  };
}
