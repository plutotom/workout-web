import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";
import { muscleGroupValidator } from "../../schemas/exercises";
import { activeWorkoutModeValidator, unitValidator } from "../../schemas/users";

const MAX_TEMPLATES = 100;
const MAX_TEMPLATE_EXERCISES = 50;
const MAX_CUSTOM_EXERCISES = 200;
const MAX_NOTES = 5_000;
const MAX_SESSIONS_PER_PAGE = 10;
const MAX_SESSION_EXERCISES = 50;
const MAX_SETS_PER_EXERCISE = 20;

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

const preferencesValidator = v.object({
  unit: unitValidator,
  barWeightLb: v.number(),
  barWeightKg: v.number(),
  activeWorkoutMode: activeWorkoutModeValidator,
  restTimerEnabled: v.boolean(),
  restTimerNotificationsEnabled: v.boolean(),
  appleHealthImportNotificationsEnabled: v.boolean(),
});

const templateSetValidator = v.object({
  weight: v.number(),
  reps: v.number(),
});

const templateValidator = v.object({
  id: v.string(),
  remoteId: v.string(),
  name: v.string(),
  updatedAt: v.number(),
  exercises: v.array(
    v.object({
      id: v.string(),
      slug: v.string(),
      orderIndex: v.number(),
      sets: v.array(templateSetValidator),
    }),
  ),
});

const customExerciseValidator = v.object({
  id: v.string(),
  remoteId: v.string(),
  slug: v.string(),
  name: v.string(),
  short: nullableString,
  category: muscleGroupValidator,
  usesBar: v.boolean(),
  archived: v.boolean(),
  updatedAt: v.number(),
});

const exerciseNoteValidator = v.object({
  slug: v.string(),
  notes: v.string(),
  updatedAt: v.number(),
});

const metadataValidator = v.union(
  v.null(),
  v.object({
    createdAt: v.number(),
    preferences: preferencesValidator,
    customExercises: v.array(customExerciseValidator),
    templates: v.array(templateValidator),
    exerciseNotes: v.array(exerciseNoteValidator),
  }),
);

const setValidator = v.object({
  id: v.string(),
  orderIndex: v.number(),
  targetWeight: v.number(),
  targetReps: v.number(),
  weight: v.number(),
  reps: v.number(),
  completed: v.boolean(),
  completedAt: nullableNumber,
});

const sessionExerciseValidator = v.object({
  id: v.string(),
  slug: v.string(),
  orderIndex: v.number(),
  restSeconds: v.number(),
  notes: nullableString,
  sets: v.array(setValidator),
});

const sessionValidator = v.object({
  id: v.string(),
  remoteId: v.string(),
  templateId: nullableString,
  remoteTemplateId: nullableString,
  templateName: v.string(),
  status: v.union(
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("abandoned"),
  ),
  sessionKind: v.union(v.literal("tracked"), v.literal("health_summary")),
  startedAt: v.number(),
  completedAt: nullableNumber,
  updatedAt: v.number(),
  countsTowardGoals: v.boolean(),
  externalProvider: v.union(v.literal("apple_health"), v.null()),
  externalId: nullableString,
  activityType: nullableString,
  sourceName: nullableString,
  sourceBundleId: nullableString,
  durationSeconds: nullableNumber,
  energyKcal: nullableNumber,
  distanceMeters: nullableNumber,
  importedAt: nullableNumber,
  exercises: v.array(sessionExerciseValidator),
});

/**
 * Account-wide data that is naturally bounded by product limits. Workout
 * history is paginated separately so a long-lived account never hits a single
 * Convex query's read or payload limit.
 */
export const metadata = query({
  args: {},
  returns: metadataValidator,
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;

    const templates = await ctx.db
      .query("workoutTemplates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MAX_TEMPLATES);

    const templatesWithExercises = await Promise.all(
      templates.map(async (template) => {
        const exercises = await ctx.db
          .query("templateExercises")
          .withIndex("by_template", (q) => q.eq("templateId", template._id))
          .take(MAX_TEMPLATE_EXERCISES);
        exercises.sort((a, b) => a.orderIndex - b.orderIndex);
        return {
          id: String(template._id),
          remoteId: String(template._id),
          name: template.name,
          updatedAt: template.updatedAt,
          exercises: exercises.map((exercise) => ({
            id: String(exercise._id),
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
      .take(MAX_CUSTOM_EXERCISES);
    const exerciseNotes = await ctx.db
      .query("exerciseNotes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MAX_NOTES);

    return {
      createdAt: Date.now(),
      preferences: {
        unit: user.unit,
        barWeightLb: user.barWeightLb ?? 45,
        barWeightKg: user.barWeightKg ?? 20,
        activeWorkoutMode: user.activeWorkoutMode ?? "list",
        restTimerEnabled: user.restTimerEnabled ?? true,
        restTimerNotificationsEnabled: true,
        appleHealthImportNotificationsEnabled: false,
      },
      customExercises: customExercises.map((exercise) => ({
        id: String(exercise._id),
        remoteId: String(exercise._id),
        slug: `custom:${String(exercise._id)}`,
        name: exercise.name,
        short: exercise.short ?? null,
        category: exercise.category,
        usesBar: exercise.usesBar,
        archived: exercise.archived,
        updatedAt: exercise._creationTime,
      })),
      templates: templatesWithExercises,
      exerciseNotes: exerciseNotes.map((note) => ({
        slug: note.exerciseSlug,
        notes: note.notes,
        updatedAt: note._creationTime,
      })),
    };
  },
});

/** A bounded page of complete workouts, including exercises and logged sets. */
export const sessionsPage = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.union(v.null(), paginationResultValidator(sessionValidator)),
  handler: async (ctx, { paginationOpts }) => {
    const user = await getUser(ctx);
    if (!user) return null;

    const requested = Math.trunc(paginationOpts.numItems);
    const numItems = Math.min(
      Math.max(Number.isFinite(requested) ? requested : 1, 1),
      MAX_SESSIONS_PER_PAGE,
    );
    const result = await ctx.db
      .query("workoutSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("asc")
      .paginate({ ...paginationOpts, numItems });

    const page = await Promise.all(
      result.page.map(async (session) => {
        const exercises = await ctx.db
          .query("sessionExercises")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .take(MAX_SESSION_EXERCISES);
        exercises.sort((a, b) => a.orderIndex - b.orderIndex);

        const exercisesWithSets = await Promise.all(
          exercises.map(async (exercise) => {
            const sets = await ctx.db
              .query("sets")
              .withIndex("by_session_exercise", (q) =>
                q.eq("sessionExerciseId", exercise._id),
              )
              .take(MAX_SETS_PER_EXERCISE);
            sets.sort((a, b) => a.orderIndex - b.orderIndex);
            return {
              id: String(exercise._id),
              slug: exercise.exerciseSlug,
              orderIndex: exercise.orderIndex,
              restSeconds: exercise.restSeconds ?? 75,
              notes: exercise.notes ?? null,
              sets: sets.map((set) => ({
                id: String(set._id),
                orderIndex: set.orderIndex,
                targetWeight: set.targetWeight ?? 0,
                targetReps: set.targetReps ?? 0,
                weight: set.weight,
                reps: set.reps,
                completed: set.completed,
                completedAt: set.completedAt ?? null,
              })),
            };
          }),
        );

        return {
          id: String(session._id),
          remoteId: String(session._id),
          templateId: session.templateId ? String(session.templateId) : null,
          remoteTemplateId: session.templateId
            ? String(session.templateId)
            : null,
          templateName: session.templateName?.trim() || "Quick start",
          status: session.status,
          sessionKind: session.sessionKind ?? "tracked",
          startedAt: session.startedAt,
          completedAt: session.completedAt ?? null,
          updatedAt:
            session.clientUpdatedAt ?? session.completedAt ?? session.startedAt,
          countsTowardGoals: session.countsTowardGoals !== false,
          externalProvider: session.externalProvider ?? null,
          externalId: session.externalId ?? null,
          activityType: session.activityType ?? null,
          sourceName: session.sourceName ?? null,
          sourceBundleId: session.sourceBundleId ?? null,
          durationSeconds: session.durationSeconds ?? null,
          energyKcal: session.energyKcal ?? null,
          distanceMeters: session.distanceMeters ?? null,
          importedAt: session.importedAt ?? null,
          exercises: exercisesWithSets,
        };
      }),
    );

    return { ...result, page };
  },
});
