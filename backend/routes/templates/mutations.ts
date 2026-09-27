import { v } from "convex/values";

import type { Id } from "../../_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import { importBundle as importBundleLib } from "../../lib/portableTemplates";
import { duplicateTemplatePlan } from "../../lib/template_dedupe";
import {
  buildStarterTemplates,
  createTemplate as createTemplateLib,
  createTemplateFromSession as createTemplateFromSessionLib,
  exerciseInputValidator,
  normalizeTemplateSets,
  removeTemplate as removeTemplateLib,
  updateTemplate as updateTemplateLib,
} from "../../lib/templates";
import { portableBundleValidator } from "../../schemas/portable";
import {
  onboardingGoalValidator,
  onboardingSettingValidator,
} from "../../schemas/users";

export const create = mutation({
  args: { name: v.string(), exercises: v.array(exerciseInputValidator) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createTemplateLib(ctx, user._id, args);
  },
});

/**
 * Create the three transparent starter templates selected during first-run
 * onboarding. The user marker makes retries safe and prevents duplicate
 * starter sets if the client reconnects after a successful mutation.
 */
export const setupStarterTemplates = mutation({
  args: {
    goal: onboardingGoalValidator,
    setting: onboardingSettingValidator,
  },
  returns: v.array(v.id("workoutTemplates")),
  handler: async (ctx, { goal, setting }) => {
    const user = await requireUser(ctx);
    if (user.onboardingTemplatesCreatedAt !== undefined) return [];

    const templates = buildStarterTemplates({ goal, setting });
    const templateIds = [];
    for (const template of templates) {
      templateIds.push(
        await createTemplateLib(ctx, user._id, {
          name: template.name,
          exercises: template.exercises,
        }),
      );
    }

    await ctx.db.patch(user._id, {
      onboardingGoal: goal,
      onboardingSetting: setting,
      onboardingTemplatesCreatedAt: Date.now(),
    });

    return templateIds;
  },
});

export const createFromSession = mutation({
  args: {
    sessionId: v.id("workoutSessions"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createTemplateFromSessionLib(ctx, user._id, args);
  },
});

export const update = mutation({
  args: {
    templateId: v.id("workoutTemplates"),
    name: v.string(),
    exercises: v.array(exerciseInputValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await updateTemplateLib(ctx, user._id, args);
  },
});

export const remove = mutation({
  args: { templateId: v.id("workoutTemplates") },
  handler: async (ctx, { templateId }) => {
    const user = await requireUser(ctx);
    await removeTemplateLib(ctx, user._id, templateId);
  },
});

const duplicateCleanupResult = v.object({
  deleted: v.number(),
  keptGroups: v.number(),
});

async function removeExactDuplicatesForUserId(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<{ deleted: number; keptGroups: number }> {
  const templates = await ctx.db
    .query("workoutTemplates")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const rows = await Promise.all(
    templates.map(async (template) => {
      const exercises = await ctx.db
        .query("templateExercises")
        .withIndex("by_template", (q) => q.eq("templateId", template._id))
        .collect();
      exercises.sort((a, b) => a.orderIndex - b.orderIndex);
      return {
        id: template._id,
        name: template.name,
        createdAt: template.createdAt,
        slugs: exercises.map((exercise) => exercise.exerciseSlug),
      };
    }),
  );
  const plan = duplicateTemplatePlan(rows);
  const sessions = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  let deleted = 0;
  for (const group of plan) {
    const keepId = group.keepId as Id<"workoutTemplates">;
    for (const doomed of group.deleteIds) {
      const doomedId = doomed as Id<"workoutTemplates">;
      await Promise.all(
        sessions
          .filter((session) => session.templateId === doomedId)
          .map((session) => ctx.db.patch(session._id, { templateId: keepId })),
      );
      const exercises = await ctx.db
        .query("templateExercises")
        .withIndex("by_template", (q) => q.eq("templateId", doomedId))
        .collect();
      await Promise.all(
        exercises.map((exercise) => ctx.db.delete(exercise._id)),
      );
      await ctx.db.delete(doomedId);
      deleted += 1;
    }
  }

  return { deleted, keptGroups: plan.length };
}

/**
 * Delete exact copies of the same template (same name + exercise slugs),
 * keeping the oldest. Sessions on the dropped copies are retargeted to the
 * kept row. Safe to run more than once.
 */
export const removeExactDuplicates = mutation({
  args: {},
  returns: duplicateCleanupResult,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await removeExactDuplicatesForUserId(ctx, user._id);
  },
});

/** CLI/dashboard cleanup for a flooded account without impersonating the user. */
export const removeExactDuplicatesForEmail = internalMutation({
  args: { email: v.string() },
  returns: v.union(duplicateCleanupResult, v.null()),
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
      .unique();
    if (!user) return null;
    return await removeExactDuplicatesForUserId(ctx, user._id);
  },
});

/**
 * Add the templates in a portable bundle to the caller's account. Additive
 * only — nothing existing is overwritten, and name collisions are suffixed.
 */
export const importBundle = mutation({
  args: {
    bundle: portableBundleValidator,
    includeNotes: v.optional(v.boolean()),
  },
  handler: async (ctx, { bundle, includeNotes }) => {
    const user = await requireUser(ctx);
    return importBundleLib(ctx, user._id, bundle, { includeNotes });
  },
});

/**
 * Update a template to match a finished session: exercise order, any exercises
 * added during the workout, and per-set presets from **all** logged set rows
 * (checkmarks are just a progress aid, not a gate). Exercises only on the
 * template (not in the session) are kept at the end in their relative order.
 */
export const syncFromSession = mutation({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireUser(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== user._id)
      throw new Error("Session not found");
    if (!session.templateId) throw new Error("Session has no template");

    if (session.placeId) {
      const place = await ctx.db.get(session.placeId);
      if (place && !place.starred) {
        return;
      }
    }

    const template = await ctx.db.get(session.templateId);
    if (!template || template.userId !== user._id)
      throw new Error("Template not found");

    const templateExercises = await ctx.db
      .query("templateExercises")
      .withIndex("by_template", (q) => q.eq("templateId", template._id))
      .collect();
    templateExercises.sort((a, b) => a.orderIndex - b.orderIndex);

    const sessionExercises = await ctx.db
      .query("sessionExercises")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    sessionExercises.sort((a, b) => a.orderIndex - b.orderIndex);

    const sessionSlugSet = new Set(
      sessionExercises.map((se) => se.exerciseSlug),
    );
    const exercises: {
      slug: string;
      sets: { weight: number; reps: number }[];
    }[] = [];

    for (const se of sessionExercises) {
      const sets = await ctx.db
        .query("sets")
        .withIndex("by_session_exercise", (q) =>
          q.eq("sessionExerciseId", se._id),
        )
        .collect();
      const logged = normalizeTemplateSets(
        sets
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((s) => ({ weight: s.weight, reps: s.reps })),
      );
      exercises.push({ slug: se.exerciseSlug, sets: logged });
    }

    for (const te of templateExercises) {
      if (sessionSlugSet.has(te.exerciseSlug)) continue;
      exercises.push({ slug: te.exerciseSlug, sets: te.sets });
    }

    await updateTemplateLib(ctx, user._id, {
      templateId: template._id,
      name: template.name,
      exercises,
    });
  },
});
