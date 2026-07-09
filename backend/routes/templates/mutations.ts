import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import {
  createTemplate as createTemplateLib,
  createTemplateFromSession as createTemplateFromSessionLib,
  exerciseInputValidator,
  normalizeTemplateSets,
  removeTemplate as removeTemplateLib,
  updateTemplate as updateTemplateLib,
} from "../../lib/templates";

export const create = mutation({
  args: { name: v.string(), exercises: v.array(exerciseInputValidator) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createTemplateLib(ctx, user._id, args);
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
