import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import { upsertExerciseNote } from "../../lib/exercise_notes";
import {
  archiveCustomExercise,
  createCustomExercise,
  updateCustomExercise,
} from "../../lib/exercises";
import {
  exerciseSlugValidator,
  muscleGroupValidator,
} from "../../schemas/exercises";

export const create = mutation({
  args: {
    name: v.string(),
    short: v.optional(v.string()),
    category: muscleGroupValidator,
    usesBar: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createCustomExercise(ctx, user._id, args);
  },
});

export const update = mutation({
  args: {
    exerciseId: v.id("customExercises"),
    name: v.string(),
    short: v.optional(v.string()),
    category: muscleGroupValidator,
    usesBar: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await updateCustomExercise(ctx, user._id, args);
  },
});

/** Soft-delete — see archiveCustomExercise. */
export const archive = mutation({
  args: { exerciseId: v.id("customExercises") },
  handler: async (ctx, { exerciseId }) => {
    const user = await requireUser(ctx);
    await archiveCustomExercise(ctx, user._id, exerciseId);
  },
});

/** Save or clear a per-exercise note (keyed by slug, shared across templates/workouts). */
export const upsertNote = mutation({
  args: {
    exerciseSlug: exerciseSlugValidator,
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await upsertExerciseNote(ctx, user._id, args.exerciseSlug, args.notes);
  },
});
