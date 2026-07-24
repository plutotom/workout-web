import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUserFromApiKey } from "../../lib/apiKeys";
import { listCustomExercises } from "../../lib/exercises";
import {
  getTemplate as getTemplateLib,
  listTemplates as listTemplatesLib,
} from "../../lib/templates";
import {
  getActiveWorkout as getActiveWorkoutLib,
  getRecentWorkouts,
  getWorkout as getWorkoutLib,
  getWorkoutHistory as getWorkoutHistoryLib,
} from "../../lib/workouts";

export const listTemplates = query({
  args: { apiKey: v.string() },
  handler: async (ctx, { apiKey }) => {
    const user = await getUserFromApiKey(ctx, apiKey);
    if (!user) throw new Error("Invalid API key");
    return listTemplatesLib(ctx, user._id);
  },
});

/** The user's custom exercises (excludes archived), for merging into the catalog. */
export const listCustom = query({
  args: { apiKey: v.string() },
  handler: async (ctx, { apiKey }) => {
    const user = await getUserFromApiKey(ctx, apiKey);
    if (!user) throw new Error("Invalid API key");
    const all = await listCustomExercises(ctx, user._id);
    return all.filter((e) => !e.archived);
  },
});

export const getTemplate = query({
  args: { apiKey: v.string(), templateId: v.id("workoutTemplates") },
  handler: async (ctx, { apiKey, templateId }) => {
    const user = await getUserFromApiKey(ctx, apiKey);
    if (!user) throw new Error("Invalid API key");
    return getTemplateLib(ctx, user._id, templateId);
  },
});

export const getActiveWorkout = query({
  args: { apiKey: v.string() },
  handler: async (ctx, { apiKey }) => {
    const user = await getUserFromApiKey(ctx, apiKey);
    if (!user) throw new Error("Invalid API key");
    const active = await getActiveWorkoutLib(ctx, user._id);
    if (!active) return null;
    return getWorkoutLib(ctx, user._id, active._id);
  },
});

export const getWorkout = query({
  args: { apiKey: v.string(), sessionId: v.id("workoutSessions") },
  handler: async (ctx, { apiKey, sessionId }) => {
    const user = await getUserFromApiKey(ctx, apiKey);
    if (!user) throw new Error("Invalid API key");
    return getWorkoutLib(ctx, user._id, sessionId);
  },
});

export const getWorkoutHistory = query({
  args: {
    apiKey: v.string(),
    templateId: v.optional(v.id("workoutTemplates")),
  },
  handler: async (ctx, { apiKey, templateId }) => {
    const user = await getUserFromApiKey(ctx, apiKey);
    if (!user) throw new Error("Invalid API key");
    if (templateId) {
      return getWorkoutHistoryLib(ctx, user._id, templateId);
    }
    return getRecentWorkouts(ctx, user._id);
  },
});
