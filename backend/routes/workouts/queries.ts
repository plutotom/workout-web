import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";
import { exerciseSlugValidator } from "../../schemas/exercises";
import {
  getActiveWorkout,
  getRecentWorkouts,
  getWorkout,
  getWorkoutHistory,
  getWorkoutRecap,
  lastSetForExercise,
} from "../../lib/workouts";

/** Recent completed workouts across all templates, plus a total count, for the dashboard. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return { total: 0, sessions: [] };
    return getRecentWorkouts(ctx, user._id);
  },
});

/** The single in-progress session for the user (V1: one active workout total), or null. */
export const active = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    return getActiveWorkout(ctx, user._id);
  },
});

/** Completed sessions for a template, newest first, with a per-exercise set summary. */
export const history = query({
  args: { templateId: v.id("workoutTemplates") },
  handler: async (ctx, { templateId }) => {
    const user = await getUser(ctx);
    if (!user) return [];
    return getWorkoutHistory(ctx, user._id, templateId);
  },
});

/** Full session detail (exercises + ordered sets) for the log screen. Null if missing/not owned. */
export const get = query({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await getUser(ctx);
    if (!user) return null;
    return getWorkout(ctx, user._id, sessionId);
  },
});

/**
 * The most recent completed set for an exercise from a prior completed
 * session, for the Focus view's "last time · +delta" line. Null when the
 * exercise has no history.
 */
export const lastLoggedSet = query({
  args: { exerciseSlug: exerciseSlugValidator },
  handler: async (ctx, { exerciseSlug }) => {
    const user = await getUser(ctx);
    if (!user) return null;
    return lastSetForExercise(ctx, user._id, exerciseSlug);
  },
});

/** Data for the post-workout story recap. */
export const recap = query({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await getUser(ctx);
    if (!user) return null;
    return getWorkoutRecap(ctx, user._id, sessionId);
  },
});
