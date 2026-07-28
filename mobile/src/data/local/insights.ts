import type { LocalInsightsSession } from "@/data/local/repository";

export type InsightsDays = 7 | 30 | 90 | null;

export const RECENT_SESSIONS_LIMIT = 5;

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
 * week of `asOf`. If that week has no workout yet, counting starts from the
 * previous week (one-week grace).
 */
export function computeWeekStreak(
  completedAts: number[],
  asOf: number = Date.now(),
): number {
  if (completedAts.length === 0) return 0;
  const weeks = new Set(completedAts.map(startOfWeekMonday));
  let cursor = startOfWeekMonday(asOf);
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

type LoadedSession = LocalInsightsSession;

function sessionVolume(session: LoadedSession): number {
  let vol = 0;
  for (const ex of session.exercises) {
    for (const set of ex.sets) {
      if (set.completed && isValidSet(set.weight, set.reps)) {
        vol += set.weight * set.reps;
      }
    }
  }
  return vol;
}

function slugSetsInSessions(sessions: LoadedSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    for (const ex of session.exercises) {
      const sets = ex.sets.filter(
        (set) => set.completed && set.reps > 0,
      ).length;
      if (sets > 0) {
        map.set(ex.slug, (map.get(ex.slug) ?? 0) + sets);
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
        if (!set.completed || !isValidSet(set.weight, set.reps)) continue;
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

export type InsightsLift = {
  slug: string;
  sessionCount: number;
  bestWeight: number;
  bestReps: number;
  est1RM: number;
  trend: "up" | "flat" | "down";
};

export type InsightsSessionSummary = {
  sessionId: string;
  templateName: string;
  completedAt: number;
  durationMs: number;
  volume: number;
  exercises: { slug: string; completedCount: number }[];
};

export type VolumeTrendPoint = {
  start: number;
  volume: number;
};

export type InsightsOverview = {
  stats: {
    workoutCount: number;
    totalDurationMs: number;
    totalVolume: number;
    priorTotalVolume: number;
    weekStreak: number;
  };
  volumeTrend: VolumeTrendPoint[];
  setsBySlug: { slug: string; sets: number }[];
  topLifts: InsightsLift[];
  recentSessions: InsightsSessionSummary[];
};

function formatSessionSummary(session: LoadedSession): InsightsSessionSummary {
  return {
    sessionId: session.sessionId,
    templateName: session.templateName,
    completedAt: session.completedAt,
    durationMs: Math.max(0, session.completedAt - session.startedAt),
    volume: sessionVolume(session),
    exercises: session.exercises
      .filter((e) => e.slug !== "__volume__")
      .map((e) => ({
        slug: e.slug,
        completedCount: e.sets.filter((set) => set.completed).length,
      })),
  };
}

function priorStatsForPeriod(
  all: LoadedSession[],
  days: InsightsDays,
  now: number,
): Map<string, SlugStats> {
  if (days === null) return new Map();
  const priorStart = now - 2 * days * MS_PER_DAY;
  const priorEnd = now - days * MS_PER_DAY;
  const priorPeriod = all.filter(
    (s) => s.completedAt >= priorStart && s.completedAt < priorEnd,
  );
  return slugStatsInSessions(priorPeriod);
}

function sessionsInPriorPeriod(
  all: LoadedSession[],
  days: InsightsDays,
  now: number,
) {
  if (days === null) return [];
  const priorStart = now - 2 * days * MS_PER_DAY;
  const priorEnd = now - days * MS_PER_DAY;
  return all.filter(
    (s) => s.completedAt >= priorStart && s.completedAt < priorEnd,
  );
}

function volumeTrendForPeriod(
  sessions: LoadedSession[],
  days: InsightsDays,
  now: number,
): VolumeTrendPoint[] {
  if (days === null) {
    return sessions
      .slice()
      .sort((a, b) => a.completedAt - b.completedAt)
      .map((session) => ({
        start: session.completedAt,
        volume: sessionVolume(session),
      }));
  }

  const start = rangeStart(days, now);
  if (start === null) return [];

  return Array.from({ length: days }, (_, index) => {
    const dayStart = start + index * MS_PER_DAY;
    const dayEnd = dayStart + MS_PER_DAY;
    return {
      start: dayStart,
      volume: sessions
        .filter((s) => s.completedAt >= dayStart && s.completedAt < dayEnd)
        .reduce((sum, session) => sum + sessionVolume(session), 0),
    };
  });
}

function liftsInPeriod(
  inPeriod: LoadedSession[],
  priorStats: Map<string, SlugStats>,
  days: InsightsDays,
): InsightsLift[] {
  const currentStats = slugStatsInSessions(inPeriod);
  return Array.from(currentStats.entries())
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
    .sort((a, b) => b.est1RM - a.est1RM);
}

function sessionsInPeriod(
  all: LoadedSession[],
  days: InsightsDays,
  now: number,
) {
  const start = rangeStart(days, now);
  return all.filter((s) => inRange(s.completedAt, start, now));
}

/** Prefer local sessions; append remote-only sessions that are not already synced locally. */
export function mergeLocalAndRemoteSessions(
  local: LocalInsightsSession[],
  remote: LocalInsightsSession[],
): LocalInsightsSession[] {
  const localKeys = new Set<string>();
  for (const session of local) {
    localKeys.add(session.sessionId);
    if (session.remoteId) localKeys.add(session.remoteId);
  }
  const extras = remote.filter(
    (session) =>
      !localKeys.has(session.sessionId) &&
      !(session.remoteId && localKeys.has(session.remoteId)),
  );
  return [...local, ...extras].sort((a, b) => b.completedAt - a.completedAt);
}

export function getLocalOverview(
  all: LoadedSession[],
  days: InsightsDays,
  now = Date.now(),
): InsightsOverview {
  const inPeriod = sessionsInPeriod(all, days, now);
  const weekStreak = computeWeekStreak(
    all.map((s) => s.completedAt),
    now,
  );
  const totalDurationMs = inPeriod.reduce(
    (sum, s) => sum + Math.max(0, s.completedAt - s.startedAt),
    0,
  );
  const totalVolume = inPeriod.reduce((sum, s) => sum + sessionVolume(s), 0);
  const priorPeriod = sessionsInPriorPeriod(all, days, now);
  const priorTotalVolume = priorPeriod.reduce(
    (sum, s) => sum + sessionVolume(s),
    0,
  );
  const volumeTrend = volumeTrendForPeriod(inPeriod, days, now);
  const setsBySlug = Array.from(slugSetsInSessions(inPeriod).entries())
    .filter(([slug]) => slug !== "__volume__")
    .map(([slug, sets]) => ({ slug, sets }))
    .sort((a, b) => b.sets - a.sets);
  const priorStats = priorStatsForPeriod(all, days, now);
  const topLifts = liftsInPeriod(inPeriod, priorStats, days).filter(
    (lift) => lift.slug !== "__volume__",
  );
  const recentSessions = inPeriod
    .slice(0, RECENT_SESSIONS_LIMIT)
    .map(formatSessionSummary);

  return {
    stats: {
      workoutCount: inPeriod.length,
      totalDurationMs,
      totalVolume,
      priorTotalVolume,
      weekStreak,
    },
    volumeTrend,
    setsBySlug,
    topLifts,
    recentSessions,
  };
}

export function getLocalLifts(
  all: LoadedSession[],
  days: InsightsDays,
  now = Date.now(),
): InsightsLift[] {
  const inPeriod = sessionsInPeriod(all, days, now);
  const priorStats = priorStatsForPeriod(all, days, now);
  return liftsInPeriod(inPeriod, priorStats, days);
}

export function getLocalSessionHistory(
  all: LoadedSession[],
  days: InsightsDays,
  now = Date.now(),
): InsightsSessionSummary[] {
  return sessionsInPeriod(all, days, now).map(formatSessionSummary);
}

export function getLocalExerciseHistory(
  all: LoadedSession[],
  slug: string,
  days: InsightsDays,
  now = Date.now(),
) {
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

export function getLocalExerciseRecords(all: LoadedSession[], slug: string) {
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
