import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const clampWhole = (n: number) => Math.max(0, Math.round(n));

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

export async function startWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    templateId,
    abandonExisting,
  }: {
    templateId: Id<"workoutTemplates">;
    abandonExisting?: boolean;
  },
) {
  const template = await ctx.db.get(templateId);
  if (!template || template.userId !== userId)
    throw new Error("Template not found");

  const active = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "in_progress"),
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
    userId,
    templateId,
    status: "in_progress",
    startedAt: Date.now(),
  });

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
}

export async function updateSet(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    setId,
    weight,
    reps,
    completed,
  }: {
    setId: Id<"sets">;
    weight?: number;
    reps?: number;
    completed?: boolean;
  },
) {
  await ownedSetContext(ctx, userId, setId);

  const patch: Partial<Doc<"sets">> = {};
  if (weight !== undefined) patch.weight = clampWhole(weight);
  if (reps !== undefined) patch.reps = clampWhole(reps);
  if (completed !== undefined) patch.completed = completed;
  await ctx.db.patch(setId, patch);
}

export async function addSet(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionExerciseId: Id<"sessionExercises">,
) {
  const sessionExercise = await ctx.db.get(sessionExerciseId);
  if (!sessionExercise) throw new Error("Exercise not found");
  await ownedSession(ctx, userId, sessionExercise.sessionId);

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
    : await lastSetForExercise(ctx, userId, sessionExercise.exerciseSlug);

  return await ctx.db.insert("sets", {
    sessionExerciseId,
    orderIndex: (last?.orderIndex ?? -1) + 1,
    weight: last?.weight ?? fallback?.weight ?? 0,
    reps: last?.reps ?? fallback?.reps ?? 0,
    completed: false,
  });
}

export async function finishWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  await ownedSession(ctx, userId, sessionId);
  await ctx.db.patch(sessionId, {
    status: "completed",
    completedAt: Date.now(),
  });
}

export async function abandonWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ownedSession(ctx, userId, sessionId);
  if (session.status === "in_progress") {
    await ctx.db.patch(sessionId, { status: "abandoned" });
  }
}

export async function getRecentWorkouts(ctx: QueryCtx, userId: Id<"users">) {
  const completed = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();
  completed.sort(
    (a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
  );

  const sessions = await Promise.all(
    completed.slice(0, 5).map(async (s) => {
      const template = await ctx.db.get(s.templateId);
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
          return { slug: e.exerciseSlug, setCount: sets.length };
        }),
      );

      return {
        _id: s._id,
        completedAt: s.completedAt ?? s.startedAt,
        templateName: template?.name ?? "Workout",
        exercises: summary,
      };
    }),
  );

  return { total: completed.length, sessions };
}

export async function getActiveWorkout(ctx: QueryCtx, userId: Id<"users">) {
  const session = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "in_progress"),
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
}

export async function getWorkoutHistory(
  ctx: QueryCtx,
  userId: Id<"users">,
  templateId: Id<"workoutTemplates">,
) {
  const sessions = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();

  const forTemplate = sessions
    .filter((s) => s.templateId === templateId)
    .sort(
      (a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
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
}

export async function getWorkout(
  ctx: QueryCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId) return null;

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
}
