import { v } from "convex/values";

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";

const clampWhole = (n: number) => Math.max(0, Math.round(n));

/**
 * Most recent completed working set ({ weight, reps }) for an exercise across
 * all of the user's templates (V1 prefill rule). Null if never logged.
 */
async function lastSetForExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  slug: Doc<"sessionExercises">["exerciseSlug"],
): Promise<{ weight: number; reps: number } | null> {
  const completed = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();
  completed.sort(
    (a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
  );

  for (const session of completed) {
    const exercises = await ctx.db
      .query("sessionExercises")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const match = exercises.find((e) => e.exerciseSlug === slug);
    if (!match) continue;

    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", match._id),
      )
      .collect();
    const done = sets
      .filter((s) => s.completed && s.weight > 0)
      .sort((a, b) => b.orderIndex - a.orderIndex);
    if (done.length) return { weight: done[0].weight, reps: done[0].reps };
  }
  return null;
}

export const start = mutation({
  args: {
    templateId: v.id("workoutTemplates"),
    abandonExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, { templateId, abandonExisting }) => {
    const user = await requireUser(ctx);

    const template = await ctx.db.get(templateId);
    if (!template || template.userId !== user._id)
      throw new Error("Template not found");

    // One active workout total (V1). Caller resolves the conflict, then retries
    // with abandonExisting.
    const active = await ctx.db
      .query("workoutSessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "in_progress"),
      )
      .first();
    if (active) {
      if (!abandonExisting) throw new Error("ACTIVE_SESSION_EXISTS");
      await ctx.db.patch(active._id, { status: "abandoned" });
    }

    const templateExercises = await ctx.db
      .query("templateExercises")
      .withIndex("by_template", (q) => q.eq("templateId", templateId))
      .collect();
    templateExercises.sort((a, b) => a.orderIndex - b.orderIndex);

    const sessionId = await ctx.db.insert("workoutSessions", {
      userId: user._id,
      templateId,
      status: "in_progress",
      startedAt: Date.now(),
    });

    // Pre-create exercises and set rows exactly as defined on the template
    // (weight + reps per set). The template is the source of truth at start.
    for (const te of templateExercises) {
      const sessionExerciseId = await ctx.db.insert("sessionExercises", {
        sessionId,
        exerciseSlug: te.exerciseSlug,
        orderIndex: te.orderIndex,
      });
      for (let i = 0; i < te.sets.length; i++) {
        const preset = te.sets[i];
        await ctx.db.insert("sets", {
          sessionExerciseId,
          orderIndex: i,
          weight: preset.weight,
          reps: preset.reps,
          completed: false,
        });
      }
    }

    return sessionId;
  },
});

/** Verify a session belongs to the user, returning it. */
async function ownedSession(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId)
    throw new Error("Session not found");
  return session;
}

/** Resolve the owning session for a set, enforcing ownership. */
async function ownedSetContext(
  ctx: MutationCtx,
  userId: Id<"users">,
  setId: Id<"sets">,
) {
  const set = await ctx.db.get(setId);
  if (!set) throw new Error("Set not found");
  const sessionExercise = await ctx.db.get(set.sessionExerciseId);
  if (!sessionExercise) throw new Error("Set not found");
  await ownedSession(ctx, userId, sessionExercise.sessionId);
  return set;
}

export const updateSet = mutation({
  args: {
    setId: v.id("sets"),
    weight: v.optional(v.number()),
    reps: v.optional(v.number()),
    completed: v.optional(v.boolean()),
  },
  handler: async (ctx, { setId, weight, reps, completed }) => {
    const user = await requireUser(ctx);
    await ownedSetContext(ctx, user._id, setId);

    const patch: Partial<Doc<"sets">> = {};
    if (weight !== undefined) patch.weight = clampWhole(weight);
    if (reps !== undefined) patch.reps = clampWhole(reps);
    if (completed !== undefined) patch.completed = completed;
    await ctx.db.patch(setId, patch);
  },
});

export const addSet = mutation({
  args: { sessionExerciseId: v.id("sessionExercises") },
  handler: async (ctx, { sessionExerciseId }) => {
    const user = await requireUser(ctx);
    const sessionExercise = await ctx.db.get(sessionExerciseId);
    if (!sessionExercise) throw new Error("Exercise not found");
    await ownedSession(ctx, user._id, sessionExercise.sessionId);

    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", sessionExerciseId),
      )
      .collect();
    sets.sort((a, b) => a.orderIndex - b.orderIndex);

    const last = sets[sets.length - 1];
    const fallback = last
      ? null
      : await lastSetForExercise(ctx, user._id, sessionExercise.exerciseSlug);

    return await ctx.db.insert("sets", {
      sessionExerciseId,
      orderIndex: (last?.orderIndex ?? -1) + 1,
      weight: last?.weight ?? fallback?.weight ?? 0,
      reps: last?.reps ?? fallback?.reps ?? 0,
      completed: false,
    });
  },
});

export const finish = mutation({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireUser(ctx);
    await ownedSession(ctx, user._id, sessionId);
    await ctx.db.patch(sessionId, {
      status: "completed",
      completedAt: Date.now(),
    });
  },
});

/** Discard an in-progress workout (kept out of history). */
export const abandon = mutation({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireUser(ctx);
    const session = await ownedSession(ctx, user._id, sessionId);
    if (session.status === "in_progress") {
      await ctx.db.patch(sessionId, { status: "abandoned" });
    }
  },
});
