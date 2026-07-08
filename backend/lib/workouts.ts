import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { computeWeekStreak, estimate1RM, startOfWeekMonday } from "./insights";
import { getNotesBySlugs } from "./exercise_notes";

const clampWhole = (n: number) => Math.max(0, Math.round(n));
const DEFAULT_REST_SECONDS = 75;

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
      restSeconds: DEFAULT_REST_SECONDS,
    });
    for (let i = 0; i < te.sets.length; i++) {
      const preset = te.sets[i];
      await ctx.db.insert("sets", {
        sessionExerciseId,
        orderIndex: i,
        targetWeight: preset.weight,
        targetReps: preset.reps,
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
  if (completed !== undefined) {
    patch.completed = completed;
    patch.completedAt = completed ? Date.now() : undefined;
  }
  await ctx.db.patch(setId, patch);
}

const DEFAULT_SET_ROWS = 3;

async function sessionExercisesFor(
  ctx: MutationCtx,
  sessionId: Id<"workoutSessions">,
) {
  const exercises = await ctx.db
    .query("sessionExercises")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
  exercises.sort((a, b) => a.orderIndex - b.orderIndex);
  return exercises;
}

async function assertSessionEditable(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ownedSession(ctx, userId, sessionId);
  if (session.status !== "in_progress")
    throw new Error("Workout is no longer active");
  return session;
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
    targetWeight: last?.targetWeight ?? last?.weight ?? fallback?.weight ?? 0,
    targetReps: last?.targetReps ?? last?.reps ?? fallback?.reps ?? 0,
    weight: last?.weight ?? fallback?.weight ?? 0,
    reps: last?.reps ?? fallback?.reps ?? 0,
    completed: false,
  });
}

export async function deleteSet(
  ctx: MutationCtx,
  userId: Id<"users">,
  setId: Id<"sets">,
) {
  const set = await ownedSetContext(ctx, userId, setId);
  const sessionExercise = await ctx.db.get(set.sessionExerciseId);
  if (!sessionExercise) throw new Error("Set not found");
  await assertSessionEditable(ctx, userId, sessionExercise.sessionId);

  const sets = await ctx.db
    .query("sets")
    .withIndex("by_session_exercise", (q) =>
      q.eq("sessionExerciseId", set.sessionExerciseId),
    )
    .collect();
  if (sets.length <= 1) throw new Error("Cannot delete the last set");

  await ctx.db.delete(setId);

  const remaining = sets
    .filter((s) => s._id !== setId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  await Promise.all(
    remaining.map((s, i) =>
      s.orderIndex === i
        ? Promise.resolve()
        : ctx.db.patch(s._id, { orderIndex: i }),
    ),
  );
}

export async function moveSessionExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionExerciseId: Id<"sessionExercises">,
  delta: number,
) {
  const sessionExercise = await ctx.db.get(sessionExerciseId);
  if (!sessionExercise) throw new Error("Exercise not found");
  await assertSessionEditable(ctx, userId, sessionExercise.sessionId);

  const exercises = await sessionExercisesFor(ctx, sessionExercise.sessionId);
  const index = exercises.findIndex((e) => e._id === sessionExerciseId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= exercises.length) return;

  const current = exercises[index];
  const swap = exercises[target];
  await ctx.db.patch(current._id, { orderIndex: swap.orderIndex });
  await ctx.db.patch(swap._id, { orderIndex: current.orderIndex });
}

export async function addSessionExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    sessionId,
    exerciseSlug,
  }: {
    sessionId: Id<"workoutSessions">;
    exerciseSlug: Doc<"sessionExercises">["exerciseSlug"];
  },
) {
  await assertSessionEditable(ctx, userId, sessionId);

  const exercises = await sessionExercisesFor(ctx, sessionId);
  if (exercises.some((e) => e.exerciseSlug === exerciseSlug))
    throw new Error("Exercise already in workout");

  const orderIndex =
    exercises.length > 0 ? exercises[exercises.length - 1].orderIndex + 1 : 0;
  const sessionExerciseId = await ctx.db.insert("sessionExercises", {
    sessionId,
    exerciseSlug,
    orderIndex,
    restSeconds: DEFAULT_REST_SECONDS,
  });

  const fallback = await lastSetForExercise(ctx, userId, exerciseSlug);
  const seed = fallback ?? { weight: 0, reps: 0 };
  await Promise.all(
    Array.from({ length: DEFAULT_SET_ROWS }, (_, i) =>
      ctx.db.insert("sets", {
        sessionExerciseId,
        orderIndex: i,
        targetWeight: seed.weight,
        targetReps: seed.reps,
        weight: seed.weight,
        reps: seed.reps,
        completed: false,
      }),
    ),
  );

  return sessionExerciseId;
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

/** Permanently remove a finished or abandoned session from history. */
export async function deleteWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ownedSession(ctx, userId, sessionId);
  if (session.status === "in_progress") {
    throw new Error("Cannot delete an active workout");
  }

  const exercises = await sessionExercisesFor(ctx, sessionId);
  for (const exercise of exercises) {
    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", exercise._id),
      )
      .collect();
    await Promise.all(sets.map((set) => ctx.db.delete(set._id)));
    await ctx.db.delete(exercise._id);
  }
  await ctx.db.delete(sessionId);
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
          return {
            slug: e.exerciseSlug,
            setCount: sets.length,
            completedCount: sets.filter((s) => s.completed).length,
          };
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

  const slugs = exercises.map((e) => e.exerciseSlug);
  const notesBySlug = await getNotesBySlugs(ctx, userId, slugs);

  const withSets = await Promise.all(
    exercises.map(async (e) => {
      const sets = await ctx.db
        .query("sets")
        .withIndex("by_session_exercise", (q) =>
          q.eq("sessionExerciseId", e._id),
        )
        .collect();
      sets.sort((a, b) => a.orderIndex - b.orderIndex);
      return {
        _id: e._id,
        slug: e.exerciseSlug,
        restSeconds: e.restSeconds ?? DEFAULT_REST_SECONDS,
        notes: notesBySlug[e.exerciseSlug],
        sets: sets.map((set) => ({
          ...set,
          targetWeight: set.targetWeight ?? set.weight,
          targetReps: set.targetReps ?? set.reps,
          completedAt: set.completedAt,
        })),
      };
    }),
  );

  return {
    _id: session._id,
    status: session.status,
    templateId: session.templateId,
    templateName: template?.name ?? "Workout",
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    exercises: withSets,
  };
}

type RecapSet = {
  slug: string;
  weight: number;
  reps: number;
  completed: boolean;
};

function validDoneSets(exercises: { slug: string; sets: Doc<"sets">[] }[]) {
  const sets: RecapSet[] = [];
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (set.completed && set.weight > 0 && set.reps > 0) {
        sets.push({
          slug: exercise.slug,
          weight: set.weight,
          reps: set.reps,
          completed: set.completed,
        });
      }
    }
  }
  return sets;
}

async function completedSessionsForUser(ctx: QueryCtx, userId: Id<"users">) {
  const sessions = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();
  sessions.sort(
    (a, b) => (a.completedAt ?? a.startedAt) - (b.completedAt ?? b.startedAt),
  );
  return sessions;
}

export async function getWorkoutRecap(
  ctx: QueryCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await getWorkout(ctx, userId, sessionId);
  if (!session) return null;

  const completedAt = session.completedAt ?? session.startedAt;
  const doneSets = validDoneSets(session.exercises);
  const totalVolume = doneSets.reduce(
    (sum, set) => sum + set.weight * set.reps,
    0,
  );
  const standout =
    doneSets
      .map((set) => ({ ...set, est1RM: estimate1RM(set.weight, set.reps) }))
      .sort((a, b) => b.est1RM - a.est1RM)[0] ?? null;

  const completedSessions = await completedSessionsForUser(ctx, userId);
  const completedAts = completedSessions.map(
    (s) => s.completedAt ?? s.startedAt,
  );
  const weekStart = startOfWeekMonday(completedAt);
  const sessionsThisWeek = completedAts.filter(
    (ts) => ts >= weekStart && ts < weekStart + 7 * 24 * 60 * 60 * 1000,
  ).length;

  const progression: { completedAt: number; est1RM: number }[] = [];
  let priorBest = 0;
  if (standout) {
    for (const s of completedSessions) {
      const exercises = await ctx.db
        .query("sessionExercises")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
        .collect();
      const match = exercises.find((e) => e.exerciseSlug === standout.slug);
      if (!match) continue;
      const sets = await ctx.db
        .query("sets")
        .withIndex("by_session_exercise", (q) =>
          q.eq("sessionExerciseId", match._id),
        )
        .collect();
      let bestForSession = 0;
      for (const set of sets) {
        if (!set.completed || set.weight <= 0 || set.reps <= 0) continue;
        bestForSession = Math.max(
          bestForSession,
          estimate1RM(set.weight, set.reps),
        );
      }
      if (bestForSession <= 0) continue;
      const ts = s.completedAt ?? s.startedAt;
      if (s._id !== sessionId && ts < completedAt) {
        priorBest = Math.max(priorBest, bestForSession);
      }
      progression.push({ completedAt: ts, est1RM: bestForSession });
    }
  }

  return {
    session,
    totals: {
      volume: totalVolume,
      durationMs: Math.max(0, completedAt - session.startedAt),
      completedSets: doneSets.length,
      exerciseCount: session.exercises.length,
    },
    standout: standout
      ? {
          slug: standout.slug,
          weight: standout.weight,
          reps: standout.reps,
          est1RM: standout.est1RM,
          isPr: standout.est1RM > priorBest,
          priorBest,
        }
      : null,
    muscleSets: session.exercises.map((exercise) => ({
      slug: exercise.slug,
      sets: exercise.sets.filter((set) => set.completed).length,
    })),
    progression: progression.slice(-7),
    consistency: {
      sessionsThisWeek,
      weeklyGoal: 4,
      weekStreak: computeWeekStreak(completedAts),
    },
  };
}
