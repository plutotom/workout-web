import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import {
  abandonWorkout,
  addSet as addSetLib,
  finishWorkout,
  startWorkout,
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
