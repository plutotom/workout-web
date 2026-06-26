import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";

/** The single in-progress session for the user (V1: one active workout total), or null. */
export const active = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;

    const session = await ctx.db
      .query("workoutSessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "in_progress"),
      )
      .first();
    if (!session) return null;

    const template = await ctx.db.get(session.templateId);
    return {
      _id: session._id,
      templateId: session.templateId,
      templateName: template?.name ?? "Workout",
      startedAt: session.startedAt,
    };
  },
});

/** Completed sessions for a template, newest first, with a per-exercise set summary. */
export const history = query({
  args: { templateId: v.id("workoutTemplates") },
  handler: async (ctx, { templateId }) => {
    const user = await getUser(ctx);
    if (!user) return [];

    const sessions = await ctx.db
      .query("workoutSessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "completed"),
      )
      .collect();

    const forTemplate = sessions
      .filter((s) => s.templateId === templateId)
      .sort(
        (a, b) =>
          (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
      );

    return await Promise.all(
      forTemplate.map(async (s) => {
        const exercises = await ctx.db
          .query("sessionExercises")
          .withIndex("by_session", (q) => q.eq("sessionId", s._id))
          .collect();
        exercises.sort((a, b) => a.orderIndex - b.orderIndex);

        const summary = await Promise.all(
          exercises.map(async (e) => {
            const sets = await ctx.db
              .query("sets")
              .withIndex("by_session_exercise", (q) =>
                q.eq("sessionExerciseId", e._id),
              )
              .collect();
            return {
              slug: e.exerciseSlug,
              setCount: sets.length,
              completedCount: sets.filter((x) => x.completed).length,
            };
          }),
        );

        return {
          _id: s._id,
          completedAt: s.completedAt ?? s.startedAt,
          exercises: summary,
        };
      }),
    );
  },
});

/** Full session detail (exercises + ordered sets) for the log screen. Null if missing/not owned. */
export const get = query({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await getUser(ctx);
    if (!user) return null;

    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== user._id) return null;

    const template = await ctx.db.get(session.templateId);

    const exercises = await ctx.db
      .query("sessionExercises")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    exercises.sort((a, b) => a.orderIndex - b.orderIndex);

    const withSets = await Promise.all(
      exercises.map(async (e) => {
        const sets = await ctx.db
          .query("sets")
          .withIndex("by_session_exercise", (q) =>
            q.eq("sessionExerciseId", e._id),
          )
          .collect();
        sets.sort((a, b) => a.orderIndex - b.orderIndex);
        return { _id: e._id, slug: e.exerciseSlug, sets };
      }),
    );

    return {
      _id: session._id,
      status: session.status,
      templateId: session.templateId,
      templateName: template?.name ?? "Workout",
      startedAt: session.startedAt,
      exercises: withSets,
    };
  },
});
