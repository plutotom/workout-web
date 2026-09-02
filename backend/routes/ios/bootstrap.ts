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
        lastPlaceId: v.union(v.id("places"), v.null()),
      }),
    ),
    places: v.array(
      v.object({
        remoteId: v.id("places"),
        clientId: v.union(v.string(), v.null()),
        name: v.string(),
        starred: v.boolean(),
        archived: v.boolean(),
        lastUsedAt: v.union(v.number(), v.null()),
      }),
    ),
    machines: v.array(
      v.object({
        remoteId: v.id("machines"),
        clientId: v.union(v.string(), v.null()),
        placeId: v.id("places"),
        exerciseSlug: v.string(),
        name: v.string(),
        isDefault: v.boolean(),
        archived: v.boolean(),
        lastUsedAt: v.union(v.number(), v.null()),
      }),
    ),
    placeWeights: v.array(
      v.object({
        placeId: v.id("places"),
        exerciseSlug: v.string(),
        machineKey: v.string(),
        sets: v.array(templateSetValidator),
        updatedAt: v.number(),
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
          lastPlaceId: template.lastPlaceId ?? null,
        };
      }),
    );

    const places = await ctx.db
      .query("places")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(50);
    const machineList = await ctx.db
      .query("machines")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(200);
    const placeWeights = (
      await Promise.all(
        places.map((place) =>
          ctx.db
            .query("exercisePlaceWeights")
            .withIndex("by_place_slug_machine", (q) =>
              q.eq("placeId", place._id),
            )
            .take(200),
        ),
      )
    ).flat();

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
      places: places.map((place) => ({
        remoteId: place._id,
        clientId: place.clientId ?? null,
        name: place.name,
        starred: place.starred,
        archived: place.archived,
        lastUsedAt: place.lastUsedAt ?? null,
      })),
      machines: machineList.map((machine) => ({
        remoteId: machine._id,
        clientId: machine.clientId ?? null,
        placeId: machine.placeId,
        exerciseSlug: machine.exerciseSlug,
        name: machine.name,
        isDefault: machine.isDefault,
        archived: machine.archived,
        lastUsedAt: machine.lastUsedAt ?? null,
      })),
      placeWeights: placeWeights.map((row) => ({
        placeId: row.placeId,
        exerciseSlug: row.exerciseSlug,
        machineKey: row.machineKey,
        sets: row.sets,
        updatedAt: row.updatedAt,
      })),
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
