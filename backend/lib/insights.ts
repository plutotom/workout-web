import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type InsightsDays = 7 | 30 | 90 | null;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

export function isValidSet(weight: number, reps: number): boolean {
  return weight > 0 && reps > 0;
}

/** Epley: weight × (1 + reps / 30), rounded whole. */
export function estimate1RM(weight: number, reps: number): number {
  if (!isValidSet(weight, reps)) return 0;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

/** Reverse Epley: predicted weight for target reps given a 1RM. */
export function predictedWeight(oneRm: number, reps: number): number {
  if (oneRm <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(oneRm);
  return Math.round(oneRm / (1 + reps / 30));
}

/** Monday 00:00:00 local time for the week containing `ts`. */
export function startOfWeekMonday(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

/**
 * Consecutive ISO weeks (Mon–Sun) with ≥1 completed workout, ending at the
 * current week. If the current week has no workout yet, counting starts from
 * the previous week (one-week grace so early-week streaks still show).
 */
export function computeWeekStreak(completedAts: number[]): number {
  if (completedAts.length === 0) return 0;
  const weeks = new Set(completedAts.map(startOfWeekMonday));
  let cursor = startOfWeekMonday(Date.now());
  if (!weeks.has(cursor)) {
    cursor -= MS_PER_WEEK;
  }
  let streak = 0;
  while (weeks.has(cursor)) {
    streak++;
    cursor -= MS_PER_WEEK;
  }
  return streak;
}

function rangeStart(days: InsightsDays, now = Date.now()): number | null {
  if (days === null) return null;
  return now - days * MS_PER_DAY;
}

function inRange(
  completedAt: number,
  start: number | null,
  end: number,
): boolean {
  if (start !== null && completedAt < start) return false;
  return completedAt <= end;
}

type LoadedSet = {
  orderIndex: number;
  weight: number;
  reps: number;
  completed: boolean;
};

type LoadedExercise = {
  slug: string;
  sets: LoadedSet[];
};

export type LoadedSession = {
  sessionId: Id<"workoutSessions">;
  templateName: string;
  startedAt: number;
  completedAt: number;
  exercises: LoadedExercise[];
};

async function loadCompletedSessions(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<LoadedSession[]> {
  const sessions = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();

  sessions.sort(
    (a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
  );

  return Promise.all(
    sessions.map(async (s) => {
      const template = await ctx.db.get(s.templateId);
      const exercises = await ctx.db
        .query("sessionExercises")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
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
          return {
            slug: e.exerciseSlug,
            sets: sets.map((set) => ({
              orderIndex: set.orderIndex,
              weight: set.weight,
              reps: set.reps,
              completed: set.completed,
            })),
          };
        }),
      );

      return {
        sessionId: s._id,
        templateName: template?.name ?? "Workout",
        startedAt: s.startedAt,
        completedAt: s.completedAt ?? s.startedAt,
        exercises: withSets,
      };
    }),
  );
}

function sessionVolume(session: LoadedSession): number {
  let vol = 0;
  for (const ex of session.exercises) {
    for (const set of ex.sets) {
      if (isValidSet(set.weight, set.reps)) {
        vol += set.weight * set.reps;
      }
    }
  }
  return vol;
}

function slugVolumeInSessions(sessions: LoadedSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    for (const ex of session.exercises) {
      let vol = 0;
      for (const set of ex.sets) {
        if (isValidSet(set.weight, set.reps)) {
          vol += set.weight * set.reps;
        }
      }
      if (vol > 0) {
        map.set(ex.slug, (map.get(ex.slug) ?? 0) + vol);
      }
    }
  }
  return map;
}

type SlugStats = {
  sessionCount: number;
  bestWeight: number;
  bestReps: number;
  bestEst1RM: number;
};

function slugStatsInSessions(
  sessions: LoadedSession[],
): Map<string, SlugStats> {
  const map = new Map<string, SlugStats>();

  for (const session of sessions) {
    const perSession = new Map<
      string,
      { bestEst1RM: number; bestWeight: number; bestReps: number }
    >();

    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        if (!isValidSet(set.weight, set.reps)) continue;
        const est = estimate1RM(set.weight, set.reps);
        const cur = perSession.get(ex.slug);
        if (!cur || est > cur.bestEst1RM) {
          perSession.set(ex.slug, {
            bestEst1RM: est,
            bestWeight: set.weight,
            bestReps: set.reps,
          });
        }
      }
    }

    for (const [slug, best] of perSession) {
      const prev = map.get(slug);
      if (!prev) {
        map.set(slug, {
          sessionCount: 1,
          bestWeight: best.bestWeight,
          bestReps: best.bestReps,
          bestEst1RM: best.bestEst1RM,
        });
      } else {
        const improved = best.bestEst1RM > prev.bestEst1RM;
        map.set(slug, {
          sessionCount: prev.sessionCount + 1,
          bestWeight: improved ? best.bestWeight : prev.bestWeight,
          bestReps: improved ? best.bestReps : prev.bestReps,
          bestEst1RM: Math.max(prev.bestEst1RM, best.bestEst1RM),
        });
      }
    }
  }
  return map;
}

function liftTrend(
  currentBest: number,
  priorBest: number,
): "up" | "flat" | "down" {
  if (priorBest === 0 && currentBest > 0) return "up";
  if (currentBest > priorBest) return "up";
  if (currentBest < priorBest) return "down";
  return "flat";
}

export async function getOverview(
  ctx: QueryCtx,
  userId: Id<"users">,
  days: InsightsDays,
) {
  const all = await loadCompletedSessions(ctx, userId);
  const now = Date.now();
  const start = rangeStart(days, now);

  const inPeriod = all.filter((s) => inRange(s.completedAt, start, now));

  const weekStreak = computeWeekStreak(all.map((s) => s.completedAt));

  const totalDurationMs = inPeriod.reduce(
    (sum, s) => sum + Math.max(0, s.completedAt - s.startedAt),
    0,
  );
  const totalVolume = inPeriod.reduce((sum, s) => sum + sessionVolume(s), 0);

  const volumeBySlug = Array.from(slugVolumeInSessions(inPeriod).entries())
    .map(([slug, volume]) => ({ slug, volume }))
    .sort((a, b) => b.volume - a.volume);

  const currentStats = slugStatsInSessions(inPeriod);

  let priorStats = new Map<string, SlugStats>();
  if (days !== null) {
    const priorStart = now - 2 * days * MS_PER_DAY;
    const priorEnd = now - days * MS_PER_DAY;
    const priorPeriod = all.filter(
      (s) => s.completedAt >= priorStart && s.completedAt < priorEnd,
    );
    priorStats = slugStatsInSessions(priorPeriod);
  }

  const topLifts = Array.from(currentStats.entries())
    .map(([slug, stats]) => {
      const priorBest = priorStats.get(slug)?.bestEst1RM ?? 0;
      return {
        slug,
        sessionCount: stats.sessionCount,
        bestWeight: stats.bestWeight,
        bestReps: stats.bestReps,
        est1RM: stats.bestEst1RM,
        trend:
          days === null
            ? ("flat" as const)
            : liftTrend(stats.bestEst1RM, priorBest),
      };
    })
    .sort((a, b) => b.est1RM - a.est1RM)
    .slice(0, 8);

  const recentSessions = inPeriod.slice(0, 5).map((s) => ({
    sessionId: s.sessionId,
    templateName: s.templateName,
    completedAt: s.completedAt,
    durationMs: Math.max(0, s.completedAt - s.startedAt),
    volume: sessionVolume(s),
    exercises: s.exercises.map((e) => ({
      slug: e.slug,
      completedCount: e.sets.filter((set) => set.completed).length,
    })),
  }));

  return {
    stats: {
      workoutCount: inPeriod.length,
      totalDurationMs,
      totalVolume,
      weekStreak,
    },
    volumeBySlug,
    topLifts,
    recentSessions,
  };
}

export async function getExerciseHistory(
  ctx: QueryCtx,
  userId: Id<"users">,
  slug: string,
  days: InsightsDays,
) {
  const all = await loadCompletedSessions(ctx, userId);
  const now = Date.now();
  const start = rangeStart(days, now);

  const sessions = all
    .filter((s) => {
      if (!inRange(s.completedAt, start, now)) return false;
      return s.exercises.some(
        (e) =>
          e.slug === slug &&
          e.sets.some((set) => isValidSet(set.weight, set.reps)),
      );
    })
    .map((s) => {
      const ex = s.exercises.find((e) => e.slug === slug)!;
      const validSets = ex.sets.filter((set) =>
        isValidSet(set.weight, set.reps),
      );
      let bestEst1RM = 0;
      for (const set of validSets) {
        bestEst1RM = Math.max(bestEst1RM, estimate1RM(set.weight, set.reps));
      }
      return {
        sessionId: s.sessionId,
        templateName: s.templateName,
        completedAt: s.completedAt,
        bestEst1RM,
        sets: validSets.map((set) => ({
          orderIndex: set.orderIndex,
          weight: set.weight,
          reps: set.reps,
        })),
      };
    });

  return { sessions };
}

export async function getExerciseRecords(
  ctx: QueryCtx,
  userId: Id<"users">,
  slug: string,
) {
  const all = await loadCompletedSessions(ctx, userId);

  let est1RM = 0;
  let bestWeight = 0;
  let bestReps = 0;
  let bestWeightDate = 0;
  let maxVolume = 0;

  const repBest = new Map<
    number,
    { weight: number; reps: number; date: number }
  >();

  for (const session of all) {
    const ex = session.exercises.find((e) => e.slug === slug);
    if (!ex) continue;

    let sessionVol = 0;
    for (const set of ex.sets) {
      if (!isValidSet(set.weight, set.reps)) continue;
      sessionVol += set.weight * set.reps;

      const est = estimate1RM(set.weight, set.reps);
      if (est > est1RM) est1RM = est;

      if (
        set.weight > bestWeight ||
        (set.weight === bestWeight && set.reps > bestReps)
      ) {
        bestWeight = set.weight;
        bestReps = set.reps;
        bestWeightDate = session.completedAt;
      }

      const cur = repBest.get(set.reps);
      if (!cur || set.weight > cur.weight) {
        repBest.set(set.reps, {
          weight: set.weight,
          reps: set.reps,
          date: session.completedAt,
        });
      }
    }
    maxVolume = Math.max(maxVolume, sessionVol);
  }

  const repLadder = Array.from({ length: 10 }, (_, i) => {
    const reps = i + 1;
    const best = repBest.get(reps);
    return {
      reps,
      bestWeight: best?.weight ?? null,
      bestReps: best?.reps ?? null,
      bestDate: best?.date ?? null,
      predicted: predictedWeight(est1RM, reps),
    };
  });

  return {
    est1RM,
    bestWeight,
    bestReps,
    bestWeightDate,
    maxVolume,
    repLadder,
  };
}
