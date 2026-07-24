import type { Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { muscleGroupValidator } from "../schemas/exercises";

export type MuscleGroup = Infer<typeof muscleGroupValidator>;

const MAX_NAME_LENGTH = 64;
const MAX_CUSTOM_EXERCISES_PER_USER = 200;

/** Synthetic slug used to reference a custom exercise from templates/sessions. */
export const customSlug = (id: Id<"customExercises">) => `custom:${id}`;

/** Serialized shape returned to clients (web + MCP). */
function toCatalogEntry(doc: Doc<"customExercises">) {
  return {
    slug: customSlug(doc._id),
    name: doc.name,
    short: doc.short,
    category: doc.category,
    usesBar: doc.usesBar,
    archived: doc.archived,
  };
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Exercise name is required");
  if (trimmed.length > MAX_NAME_LENGTH)
    throw new Error(
      `Exercise name must be at most ${MAX_NAME_LENGTH} characters`,
    );
  return trimmed;
}

function normalizeShort(short: string | undefined): string | undefined {
  const trimmed = short?.trim();
  return trimmed ? trimmed.slice(0, MAX_NAME_LENGTH) : undefined;
}

/**
 * All of a user's custom exercises, including archived ones. The catalog needs
 * archived entries so old templates/sessions can still resolve their names;
 * callers (e.g. the picker) filter archived out themselves.
 */
export async function listCustomExercises(ctx: QueryCtx, userId: Id<"users">) {
  const docs = await ctx.db
    .query("customExercises")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  docs.sort((a, b) => a.name.localeCompare(b.name));
  return docs.map(toCatalogEntry);
}

export async function createCustomExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    name: string;
    short?: string;
    category: MuscleGroup;
    usesBar: boolean;
  },
) {
  const existing = await ctx.db
    .query("customExercises")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_CUSTOM_EXERCISES_PER_USER);
  if (existing.length >= MAX_CUSTOM_EXERCISES_PER_USER) {
    throw new Error(
      `At most ${MAX_CUSTOM_EXERCISES_PER_USER} custom exercises are allowed`,
    );
  }

  const id = await ctx.db.insert("customExercises", {
    userId,
    name: normalizeName(args.name),
    short: normalizeShort(args.short),
    category: args.category,
    usesBar: args.usesBar,
    archived: false,
  });
  return { id, slug: customSlug(id) };
}

async function requireOwned(
  ctx: MutationCtx,
  userId: Id<"users">,
  exerciseId: Id<"customExercises">,
) {
  const doc = await ctx.db.get(exerciseId);
  if (!doc || doc.userId !== userId) throw new Error("Exercise not found");
  return doc;
}

export async function updateCustomExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    exerciseId: Id<"customExercises">;
    name: string;
    short?: string;
    category: MuscleGroup;
    usesBar: boolean;
  },
) {
  await requireOwned(ctx, userId, args.exerciseId);
  await ctx.db.patch(args.exerciseId, {
    name: normalizeName(args.name),
    short: normalizeShort(args.short),
    category: args.category,
    usesBar: args.usesBar,
  });
}

/** Soft-delete: hide from pickers but keep resolving the name in old history. */
export async function archiveCustomExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  exerciseId: Id<"customExercises">,
) {
  await requireOwned(ctx, userId, exerciseId);
  await ctx.db.patch(exerciseId, { archived: true });
}
