import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { computeWeekStreak, estimate1RM, startOfWeekMonday } from "./insights";
import { getNotesBySlugs } from "./exercise_notes";

const clampWhole = (n: number) => Math.max(0, Math.round(n));
const DEFAULT_REST_SECONDS = 75;

/**
 * The most recent completed set (weight > 0) for an exercise across the
 * user's completed sessions. In-progress sessions never match, so the
 * current workout is excluded by construction.
 */
export async function lastSetForExercise(
  ctx: QueryCtx,
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

async function abandonActiveIfNeeded(
  ctx: MutationCtx,
  userId: Id<"users">,
  abandonExisting?: boolean,
) {
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

  await abandonActiveIfNeeded(ctx, userId, abandonExisting);

  const templateExercises = await ctx.db
    .query("templateExercises")
    .withIndex("by_template", (q) => q.eq("templateId", templateId))
    .collect();
  templateExercises.sort((a, b) => a.orderIndex - b.orderIndex);

  const sessionId = await ctx.db.insert("workoutSessions", {
    userId,
    templateId,
    templateName: template.name,
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

/** Start an empty session with no template — user adds exercises as they go. */
export async function startBlankWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  { abandonExisting }: { abandonExisting?: boolean } = {},
) {
  await abandonActiveIfNeeded(ctx, userId, abandonExisting);

  return await ctx.db.insert("workoutSessions", {
    userId,
    status: "in_progress",
    startedAt: Date.now(),
  });
}

function sessionDisplayName(
  template: Doc<"workoutTemplates"> | null | undefined,
  snapshotName?: string | null,
) {
  const name = template?.name ?? snapshotName?.trim();
  return name && name.length > 0 ? name : "Quick start";
}

/** A set counts as logged work if it was checked off with at least one rep
 * (weight may be 0 for bodyweight lifts). */
export function isLoggedSet(set: {
  completed: boolean;
  reps: number;
}): boolean {
  return set.completed && set.reps > 0;
}

async function sessionHasLoggedWork(
  ctx: MutationCtx | QueryCtx,
  sessionId: Id<"workoutSessions">,
): Promise<boolean> {
  const exercises = await sessionExercisesFor(ctx, sessionId);
  for (const exercise of exercises) {
    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", exercise._id),
      )
      .collect();
    if (sets.some(isLoggedSet)) return true;
  }
  return false;
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
  ctx: MutationCtx | QueryCtx,
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

/** Remove an exercise (and its sets) from an in-progress workout. */
export async function removeSessionExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionExerciseId: Id<"sessionExercises">,
) {
  const sessionExercise = await ctx.db.get(sessionExerciseId);
  if (!sessionExercise) throw new Error("Exercise not found");
  await assertSessionEditable(ctx, userId, sessionExercise.sessionId);

  const sets = await ctx.db
    .query("sets")
    .withIndex("by_session_exercise", (q) =>
      q.eq("sessionExerciseId", sessionExerciseId),
    )
    .collect();
  await Promise.all(sets.map((set) => ctx.db.delete(set._id)));
  await ctx.db.delete(sessionExerciseId);

  const remaining = await sessionExercisesFor(ctx, sessionExercise.sessionId);
  await Promise.all(
    remaining.map((exercise, i) =>
      exercise.orderIndex === i
        ? Promise.resolve()
        : ctx.db.patch(exercise._id, { orderIndex: i }),
    ),
  );
}

export async function finishWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ownedSession(ctx, userId, sessionId);
  if (session.status !== "in_progress") {
    throw new Error("Workout is no longer active");
  }

  const exercises = await sessionExercisesFor(ctx, sessionId);
  if (exercises.length === 0) {
    throw new Error("Add at least one exercise before finishing");
  }
  if (!(await sessionHasLoggedWork(ctx, sessionId))) {
    throw new Error("Check off at least one set with reps before finishing");
  }

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
      const template = s.templateId ? await ctx.db.get(s.templateId) : null;
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
        templateName: sessionDisplayName(template, s.templateName),
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

  const template = session.templateId
    ? await ctx.db.get(session.templateId)
    : null;
  return {
    _id: session._id,
    templateId: session.templateId ?? null,
    templateName: sessionDisplayName(template, session.templateName),
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
    .filter((s) => s.templateId !== undefined && s.templateId === templateId)
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

  const template = session.templateId
    ? await ctx.db.get(session.templateId)
    : null;

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
    templateId: session.templateId ?? null,
    templateName: sessionDisplayName(template, session.templateName),
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

type BestSet = { weight: number; reps: number };

/** Prefer heavier weight; at equal weight, prefer more reps. */
function compareBestSets(a: BestSet, b: BestSet): number {
  if (a.weight !== b.weight) return a.weight - b.weight;
  return a.reps - b.reps;
}

function betterBestSet(a: BestSet | null, b: BestSet): BestSet {
  if (!a || compareBestSets(b, a) > 0) return b;
  return a;
}

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

type ProgressionPoint = {
  completedAt: number;
  weight: number;
  reps: number;
  est1RM: number;
  sameTemplate: boolean;
};

async function bestSetForSlugInSession(
  ctx: QueryCtx,
  sessionDoc: Doc<"workoutSessions">,
  slug: string,
): Promise<(BestSet & { est1RM: number }) | null> {
  const exercises = await ctx.db
    .query("sessionExercises")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionDoc._id))
    .collect();
  const match = exercises.find((e) => e.exerciseSlug === slug);
  if (!match) return null;

  const sets = await ctx.db
    .query("sets")
    .withIndex("by_session_exercise", (q) =>
      q.eq("sessionExerciseId", match._id),
    )
    .collect();

  let best: BestSet | null = null;
  for (const set of sets) {
    if (!set.completed || set.weight <= 0 || set.reps <= 0) continue;
    best = betterBestSet(best, { weight: set.weight, reps: set.reps });
  }
  if (!best) return null;
  return { ...best, est1RM: estimate1RM(best.weight, best.reps) };
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
    [...doneSets].sort((a, b) => compareBestSets(b, a))[0] ?? null;

  const completedSessions = await completedSessionsForUser(ctx, userId);
  const meaningfulAts: number[] = [];
  for (const s of completedSessions) {
    const ts = s.completedAt ?? s.startedAt;
    if (ts > completedAt) continue;
    if (await sessionHasLoggedWork(ctx, s._id)) {
      meaningfulAts.push(ts);
    }
  }
  const weekStart = startOfWeekMonday(completedAt);
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const weekAts = meaningfulAts.filter((ts) => ts >= weekStart && ts < weekEnd);
  const sessionsThisWeek = weekAts.length;
  // Mon–Sun flags for the week containing this session.
  const daysWorked = [false, false, false, false, false, false, false] as [
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
  ];
  for (const ts of weekAts) {
    const day = new Date(ts).getDay(); // 0 = Sun
    const monIndex = day === 0 ? 6 : day - 1;
    daysWorked[monIndex] = true;
  }

  const allPoints: ProgressionPoint[] = [];
  let priorBest: BestSet | null = null;
  if (standout) {
    for (const s of completedSessions) {
      const ts = s.completedAt ?? s.startedAt;
      if (ts > completedAt) continue;
      const best = await bestSetForSlugInSession(ctx, s, standout.slug);
      if (!best) continue;
      if (s._id !== sessionId && ts < completedAt) {
        priorBest = betterBestSet(priorBest, best);
      }
      allPoints.push({
        completedAt: ts,
        weight: best.weight,
        reps: best.reps,
        est1RM: best.est1RM,
        sameTemplate:
          session.templateId !== null &&
          s.templateId !== undefined &&
          s.templateId === session.templateId,
      });
    }
  }

  // Prefer same-template lineage when there are at least 2 points (today + prior).
  const sameTemplatePoints = allPoints.filter((p) => p.sameTemplate);
  const useTemplateLineage = sameTemplatePoints.length >= 2;
  const lineagePoints = useTemplateLineage ? sameTemplatePoints : allPoints;
  const chartPoints = lineagePoints.slice(-7);

  const todayPoint = chartPoints[chartPoints.length - 1] ?? null;
  const previousPoint =
    chartPoints.length >= 2 ? chartPoints[chartPoints.length - 2] : null;
  const isBaseline = chartPoints.length < 2;

  const vsPreviousWeight =
    todayPoint && previousPoint
      ? todayPoint.weight - previousPoint.weight
      : null;

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
          est1RM: estimate1RM(standout.weight, standout.reps),
          isPr: priorBest ? compareBestSets(standout, priorBest) > 0 : true,
          priorBest,
        }
      : null,
    muscleSets: session.exercises.map((exercise) => ({
      slug: exercise.slug,
      sets: exercise.sets.filter((set) => isLoggedSet(set)).length,
    })),
    /** @deprecated Prefer `progressionStory` — kept for older clients. */
    progression: chartPoints.map((p) => ({
      completedAt: p.completedAt,
      est1RM: p.est1RM,
    })),
    progressionStory:
      standout && chartPoints.length > 0
        ? {
            slug: standout.slug,
            scopedToTemplate: useTemplateLineage,
            isBaseline,
            points: chartPoints,
            today: todayPoint
              ? {
                  weight: todayPoint.weight,
                  reps: todayPoint.reps,
                  est1RM: todayPoint.est1RM,
                }
              : null,
            previous: previousPoint
              ? {
                  weight: previousPoint.weight,
                  reps: previousPoint.reps,
                  est1RM: previousPoint.est1RM,
                  completedAt: previousPoint.completedAt,
                }
              : null,
            vsPreviousWeight,
          }
        : null,
    consistency: {
      sessionsThisWeek,
      weeklyGoal: 4,
      weekStreak: computeWeekStreak(meaningfulAts, completedAt),
      /** Mon–Sun: true if at least one logged workout that day. */
      daysWorked,
    },
  };
}
