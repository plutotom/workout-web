import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUserFromApiKey } from "../../lib/apiKeys";
import {
  archiveCustomExercise as archiveCustomExerciseLib,
  createCustomExercise as createCustomExerciseLib,
  updateCustomExercise as updateCustomExerciseLib,
} from "../../lib/exercises";
import {
  createTemplate as createTemplateLib,
  exerciseInputValidator,
  removeTemplate,
  updateTemplate as updateTemplateLib,
} from "../../lib/templates";
import { muscleGroupValidator } from "../../schemas/exercises";
import {
  abandonWorkout as abandonWorkoutLib,
  addSet as addSetLib,
  finishWorkout as finishWorkoutLib,
  getWorkout as getWorkoutLib,
  startWorkout as startWorkoutLib,
  updateSet as updateSetLib,
} from "../../lib/workouts";

export const createTemplate = mutation({
  args: {
    apiKey: v.string(),
    name: v.string(),
    exercises: v.array(exerciseInputValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUserFromApiKey(ctx, args.apiKey);
    return createTemplateLib(ctx, user._id, {
      name: args.name,
      exercises: args.exercises,
    });
  },
});

export const updateTemplate = mutation({
  args: {
    apiKey: v.string(),
    templateId: v.id("workoutTemplates"),
    name: v.string(),
    exercises: v.array(exerciseInputValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUserFromApiKey(ctx, args.apiKey);
    await updateTemplateLib(ctx, user._id, args);
  },
});

export const deleteTemplate = mutation({
  args: { apiKey: v.string(), templateId: v.id("workoutTemplates") },
  handler: async (ctx, { apiKey, templateId }) => {
    const user = await requireUserFromApiKey(ctx, apiKey);
    await removeTemplate(ctx, user._id, templateId);
  },
});

export const createCustomExercise = mutation({
  args: {
    apiKey: v.string(),
    name: v.string(),
    short: v.optional(v.string()),
    category: muscleGroupValidator,
    usesBar: v.boolean(),
  },
  handler: async (ctx, { apiKey, ...args }) => {
    const user = await requireUserFromApiKey(ctx, apiKey);
    return createCustomExerciseLib(ctx, user._id, args);
  },
});

export const updateCustomExercise = mutation({
  args: {
    apiKey: v.string(),
    exerciseId: v.id("customExercises"),
    name: v.string(),
    short: v.optional(v.string()),
    category: muscleGroupValidator,
    usesBar: v.boolean(),
  },
  handler: async (ctx, { apiKey, ...args }) => {
    const user = await requireUserFromApiKey(ctx, apiKey);
    await updateCustomExerciseLib(ctx, user._id, args);
  },
});

export const archiveCustomExercise = mutation({
  args: { apiKey: v.string(), exerciseId: v.id("customExercises") },
  handler: async (ctx, { apiKey, exerciseId }) => {
    const user = await requireUserFromApiKey(ctx, apiKey);
    await archiveCustomExerciseLib(ctx, user._id, exerciseId);
  },
});

export const startWorkout = mutation({
  args: {
    apiKey: v.string(),
    templateId: v.id("workoutTemplates"),
    abandonExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserFromApiKey(ctx, args.apiKey);
    const sessionId = await startWorkoutLib(ctx, user._id, args);
    return getWorkoutLib(ctx, user._id, sessionId);
  },
});

export const updateSet = mutation({
  args: {
    apiKey: v.string(),
    setId: v.id("sets"),
    weight: v.optional(v.number()),
    reps: v.optional(v.number()),
    completed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserFromApiKey(ctx, args.apiKey);
    await updateSetLib(ctx, user._id, args);
  },
});

export const addSet = mutation({
  args: {
    apiKey: v.string(),
    sessionExerciseId: v.id("sessionExercises"),
  },
  handler: async (ctx, args) => {
    const user = await requireUserFromApiKey(ctx, args.apiKey);
    return addSetLib(ctx, user._id, args.sessionExerciseId);
  },
});

export const finishWorkout = mutation({
  args: { apiKey: v.string(), sessionId: v.id("workoutSessions") },
  handler: async (ctx, { apiKey, sessionId }) => {
    const user = await requireUserFromApiKey(ctx, apiKey);
    await finishWorkoutLib(ctx, user._id, sessionId);
    return getWorkoutLib(ctx, user._id, sessionId);
  },
});

export const abandonWorkout = mutation({
  args: { apiKey: v.string(), sessionId: v.id("workoutSessions") },
  handler: async (ctx, { apiKey, sessionId }) => {
    const user = await requireUserFromApiKey(ctx, apiKey);
    await abandonWorkoutLib(ctx, user._id, sessionId);
  },
});
