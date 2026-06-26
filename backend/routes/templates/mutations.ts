import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import {
  createTemplate as createTemplateLib,
  exerciseInputValidator,
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
 * Update a template's per-set presets to match a finished session, using **all**
 * logged set rows (checkmarks are just a progress aid, not a gate). Matches
 * exercises by slug; an exercise no longer on the template is skipped.
 */
export const syncFromSession = mutation({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireUser(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== user._id)
      throw new Error("Session not found");

    const template = await ctx.db.get(session.templateId);
    if (!template || template.userId !== user._id)
      throw new Error("Template not found");

    const templateExercises = await ctx.db
      .query("templateExercises")
      .withIndex("by_template", (q) => q.eq("templateId", template._id))
      .collect();
    const bySlug = new Map(
      templateExercises.map((te) => [te.exerciseSlug, te]),
    );

    const sessionExercises = await ctx.db
      .query("sessionExercises")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    let changed = false;
    for (const se of sessionExercises) {
      const target = bySlug.get(se.exerciseSlug);
      if (!target) continue;

      const sets = await ctx.db
        .query("sets")
        .withIndex("by_session_exercise", (q) =>
          q.eq("sessionExerciseId", se._id),
        )
        .collect();
      const logged = sets
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((s) => ({ weight: s.weight, reps: s.reps }));
      if (logged.length === 0) continue;

      await ctx.db.patch(target._id, { sets: logged });
      changed = true;
    }

    if (changed) await ctx.db.patch(template._id, { updatedAt: Date.now() });
  },
});
