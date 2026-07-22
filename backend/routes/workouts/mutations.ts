import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import { exerciseSlugValidator } from "../../schemas/exercises";
import {
  abandonWorkout,
  deleteWorkout,
  addExercisesFromDraft as addExercisesFromDraftLib,
  addSessionExercise as addSessionExerciseLib,
  addSet as addSetLib,
  deleteSet as deleteSetLib,
  finishWorkout,
  moveSessionExercise as moveSessionExerciseLib,
  removeSessionExercise as removeSessionExerciseLib,
  startBlankWorkout,
  startWorkout,
  undoAiGeneration as undoAiGenerationLib,
  updateSet as updateSetLib,
} from "../../lib/workouts";

export const start = mutation({
  args: {
    templateId: v.id("workoutTemplates"),
    abandonExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return startWorkout(ctx, user._id, args);
  },
});

/** Start an empty workout with no template — add exercises as you go. */
export const startBlank = mutation({
  args: {
    abandonExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return startBlankWorkout(ctx, user._id, args);
  },
});

export const updateSet = mutation({
  args: {
    setId: v.id("sets"),
    weight: v.optional(v.number()),
    reps: v.optional(v.number()),
    completed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await updateSetLib(ctx, user._id, args);
  },
});

export const addSet = mutation({
  args: { sessionExerciseId: v.id("sessionExercises") },
  handler: async (ctx, { sessionExerciseId }) => {
    const user = await requireUser(ctx);
    return addSetLib(ctx, user._id, sessionExerciseId);
  },
});

export const deleteSet = mutation({
  args: { setId: v.id("sets") },
  handler: async (ctx, { setId }) => {
    const user = await requireUser(ctx);
    await deleteSetLib(ctx, user._id, setId);
  },
});

export const moveExercise = mutation({
  args: {
    sessionExerciseId: v.id("sessionExercises"),
    delta: v.number(),
  },
  handler: async (ctx, { sessionExerciseId, delta }) => {
    const user = await requireUser(ctx);
    await moveSessionExerciseLib(ctx, user._id, sessionExerciseId, delta);
  },
});

export const addExercise = mutation({
  args: {
    sessionId: v.id("workoutSessions"),
    exerciseSlug: exerciseSlugValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return addSessionExerciseLib(ctx, user._id, args);
  },
});

/**
 * Apply AI session reshape: optional removals + appends. Snapshots removals
 * for undo when aiGenerationId is set.
 */
export const addExercisesFromDraft = mutation({
  args: {
    sessionId: v.id("workoutSessions"),
    exercises: v.array(
      v.object({
        slug: exerciseSlugValidator,
        sets: v.array(
          v.object({
            weight: v.number(),
            reps: v.number(),
          }),
        ),
      }),
    ),
    removeSlugs: v.optional(v.array(exerciseSlugValidator)),
    aiGenerationId: v.optional(v.string()),
  },
  returns: v.object({
    ids: v.array(v.id("sessionExercises")),
    generationId: v.union(v.string(), v.null()),
    removedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return addExercisesFromDraftLib(ctx, user._id, args);
  },
});

/**
 * Undo an AI reshape: remove batch adds (with no logged sets) and restore
 * snapshotted removals for that generation.
 */
export const undoAiGeneration = mutation({
  args: {
    sessionId: v.id("workoutSessions"),
    generationId: v.string(),
  },
  returns: v.object({
    removed: v.number(),
    kept: v.number(),
    restored: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return undoAiGenerationLib(ctx, user._id, args);
  },
});

export const removeExercise = mutation({
  args: { sessionExerciseId: v.id("sessionExercises") },
  handler: async (ctx, { sessionExerciseId }) => {
    const user = await requireUser(ctx);
    await removeSessionExerciseLib(ctx, user._id, sessionExerciseId);
  },
});

export const finish = mutation({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireUser(ctx);
    await finishWorkout(ctx, user._id, sessionId);
  },
});

/** Discard an in-progress workout (kept out of history). */
export const abandon = mutation({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireUser(ctx);
    await abandonWorkout(ctx, user._id, sessionId);
  },
});

/** Permanently remove a completed or abandoned session from history. */
export const deleteSession = mutation({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireUser(ctx);
    await deleteWorkout(ctx, user._id, sessionId);
  },
});
