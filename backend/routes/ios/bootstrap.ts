import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";
import { activeWorkoutModeValidator, unitValidator } from "../../schemas/users";

const templateSetValidator = v.object({
  weight: v.number(),
  reps: v.number(),
});

const bootstrapResultValidator = v.union(
  v.null(),
  v.object({
    serverTime: v.number(),
    preferences: v.object({
      unit: unitValidator,
      barWeightLb: v.union(v.number(), v.null()),
      barWeightKg: v.union(v.number(), v.null()),
      activeWorkoutMode: activeWorkoutModeValidator,
      restTimerEnabled: v.boolean(),
    }),
    templates: v.array(
      v.object({
        remoteId: v.id("workoutTemplates"),
        name: v.string(),
        updatedAt: v.number(),
        exercises: v.array(
          v.object({
            slug: v.string(),
            orderIndex: v.number(),
            sets: v.array(templateSetValidator),
          }),
        ),
      }),
    ),
    customExercises: v.array(
      v.object({
        remoteId: v.id("customExercises"),
        clientId: v.union(v.string(), v.null()),
        name: v.string(),
        short: v.union(v.string(), v.null()),
        category: v.string(),
        usesBar: v.boolean(),
        archived: v.boolean(),
      }),
    ),
    exerciseNotes: v.array(
      v.object({
        slug: v.string(),
        notes: v.string(),
      }),
    ),
  }),
);

/**
 * Bounded seed payload for an iOS device. The phone persists this response in
 * SQLite and does not need Convex to remain reachable during a workout.
 */
export const get = query({
  args: {},
  returns: bootstrapResultValidator,
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;

    const templates = await ctx.db
      .query("workoutTemplates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);

    const templatesWithExercises = await Promise.all(
      templates.map(async (template) => {
        const exercises = await ctx.db
          .query("templateExercises")
          .withIndex("by_template", (q) => q.eq("templateId", template._id))
          .take(50);
        exercises.sort((a, b) => a.orderIndex - b.orderIndex);
        return {
          remoteId: template._id,
          name: template.name,
          updatedAt: template.updatedAt,
          exercises: exercises.map((exercise) => ({
            slug: exercise.exerciseSlug,
            orderIndex: exercise.orderIndex,
            sets: exercise.sets,
          })),
        };
      }),
    );

    const customExercises = await ctx.db
      .query("customExercises")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(500);
    const exerciseNotes = await ctx.db
      .query("exerciseNotes")
      .withIndex("by_user_slug", (q) => q.eq("userId", user._id))
      .take(500);

    return {
      serverTime: Date.now(),
      preferences: {
        unit: user.unit,
        barWeightLb: user.barWeightLb ?? null,
        barWeightKg: user.barWeightKg ?? null,
        activeWorkoutMode: user.activeWorkoutMode ?? "list",
        restTimerEnabled: user.restTimerEnabled ?? true,
      },
      templates: templatesWithExercises,
      customExercises: customExercises.map((exercise) => ({
        remoteId: exercise._id,
        clientId: exercise.clientId ?? null,
        name: exercise.name,
        short: exercise.short ?? null,
        category: exercise.category,
        usesBar: exercise.usesBar,
        archived: exercise.archived,
      })),
      exerciseNotes: exerciseNotes.map((note) => ({
        slug: note.exerciseSlug,
        notes: note.notes,
      })),
    };
  },
});
