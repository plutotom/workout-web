import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";

/** User's templates (newest-edited first) with their ordered exercises and last completed-session time. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];

    const templates = await ctx.db
      .query("workoutTemplates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const completedSessions = await ctx.db
      .query("workoutSessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "completed"),
      )
      .collect();

    const result = await Promise.all(
      templates.map(async (t) => {
        const exercises = await ctx.db
          .query("templateExercises")
          .withIndex("by_template", (q) => q.eq("templateId", t._id))
          .collect();
        exercises.sort((a, b) => a.orderIndex - b.orderIndex);

        const times = completedSessions
          .filter((s) => s.templateId === t._id)
          .map((s) => s.completedAt ?? s.startedAt);
        const lastSessionAt = times.length ? Math.max(...times) : null;

        return {
          _id: t._id,
          name: t.name,
          updatedAt: t.updatedAt,
          lastSessionAt,
          exercises: exercises.map((e) => ({
            slug: e.exerciseSlug,
            setCount: e.sets.length,
          })),
        };
      }),
    );

    result.sort((a, b) => b.updatedAt - a.updatedAt);
    return result;
  },
});

/** A single template with its ordered exercises, for the editor. Null if missing/not owned. */
export const get = query({
  args: { templateId: v.id("workoutTemplates") },
  handler: async (ctx, { templateId }) => {
    const user = await getUser(ctx);
    if (!user) return null;

    const template = await ctx.db.get(templateId);
    if (!template || template.userId !== user._id) return null;

    const exercises = await ctx.db
      .query("templateExercises")
      .withIndex("by_template", (q) => q.eq("templateId", templateId))
      .collect();
    exercises.sort((a, b) => a.orderIndex - b.orderIndex);

    return {
      _id: template._id,
      name: template.name,
      exercises: exercises.map((e) => ({
        slug: e.exerciseSlug,
        sets: e.sets,
      })),
    };
  },
});
