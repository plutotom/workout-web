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
  lastCompletedAt: number;
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
          lastCompletedAt: session.completedAt,
        });
      } else {
        const improved = best.bestEst1RM > prev.bestEst1RM;
        map.set(slug, {
          sessionCount: prev.sessionCount + 1,
          bestWeight: improved ? best.bestWeight : prev.bestWeight,
          bestReps: improved ? best.bestReps : prev.bestReps,
          bestEst1RM: Math.max(prev.bestEst1RM, best.bestEst1RM),
          lastCompletedAt: Math.max(prev.lastCompletedAt, session.completedAt),
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
  lastCompletedAt: number;
};

export type InsightsSessionSummary = {
  sessionId: string;
  templateName: string;
  completedAt: number;
  durationMs: number;
  volume: number;
  sessionKind?: "tracked" | "health_summary";
  sourceName?: string | null;
  activityType?: string | null;
  distanceMeters?: number | null;
  energyKcal?: number | null;
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
  const durationMs =
    session.health?.durationSeconds != null
      ? session.health.durationSeconds * 1000
      : Math.max(0, session.completedAt - session.startedAt);
  return {
    sessionId: session.sessionId,
    templateName: session.templateName,
    completedAt: session.completedAt,
    durationMs,
    volume: sessionVolume(session),
    sessionKind: session.sessionKind,
    sourceName: session.health?.sourceName ?? null,
    activityType: session.health?.activityType ?? null,
    distanceMeters: session.health?.distanceMeters ?? null,
    energyKcal: session.health?.energyKcal ?? null,
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
        lastCompletedAt: stats.lastCompletedAt,
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
    all.filter(sessionCountsTowardGoals).map((s) => s.completedAt),
    now,
  );
  const totalDurationMs = inPeriod.reduce((sum, s) => {
    if (s.health?.durationSeconds != null) {
      return sum + s.health.durationSeconds * 1000;
    }
    return sum + Math.max(0, s.completedAt - s.startedAt);
  }, 0);
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
      workoutCount: inPeriod.filter(sessionCountsTowardGoals).length,
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

/**
 * Post-workout recap, ported from the server's `getWorkoutRecap` so the story
 * screen renders offline. Same inputs (completed sessions, oldest to newest)
 * produce the same beats the web app shows.
 */

/** Sets that count toward recap totals. Weight may be 0 (bodyweight). */
function isLoggedSet(set: { completed: boolean; reps: number }): boolean {
  return set.completed && set.reps > 0;
}

type BestSet = { weight: number; reps: number };

function isInverseWeightSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  return (
    s.includes("assisted") ||
    s.includes("counterweighted") ||
    s.includes("counterweight")
  );
}

function compareBestSetsForSlug(
  a: BestSet,
  b: BestSet,
  inverseWeight: boolean,
): number {
  const aw = inverseWeight ? -a.weight : a.weight;
  const bw = inverseWeight ? -b.weight : b.weight;
  if (aw !== bw) return aw - bw;
  return a.reps - b.reps;
}

function betterBestSetForSlug(
  a: BestSet | null,
  b: BestSet,
  inverseWeight: boolean,
): BestSet {
  if (!a || compareBestSetsForSlug(b, a, inverseWeight) > 0) return b;
  return a;
}

type RecapSet = { slug: string; weight: number; reps: number };

function compareRecapSets(a: RecapSet, b: RecapSet): number {
  const aw = isInverseWeightSlug(a.slug) ? -a.weight : a.weight;
  const bw = isInverseWeightSlug(b.slug) ? -b.weight : b.weight;
  if (aw !== bw) return aw - bw;
  return a.reps - b.reps;
}

function bestSetForSlug(
  session: LoadedSession,
  slug: string,
): (BestSet & { est1RM: number }) | null {
  const inverseWeight = isInverseWeightSlug(slug);
  let best: BestSet | null = null;
  for (const exercise of session.exercises) {
    if (exercise.slug !== slug) continue;
    for (const set of exercise.sets) {
      if (!isLoggedSet(set)) continue;
      best = betterBestSetForSlug(
        best,
        { weight: set.weight, reps: set.reps },
        inverseWeight,
      );
    }
  }
  if (!best) return null;
  return { ...best, est1RM: estimate1RM(best.weight, best.reps) };
}

function hasLoggedWork(session: LoadedSession) {
  return session.exercises.some((exercise) =>
    exercise.sets.some((set) => set.completed && set.reps > 0),
  );
}

function sessionCountsTowardGoals(session: LoadedSession) {
  if (session.sessionKind === "health_summary") {
    return session.countsTowardGoals !== false;
  }
  return hasLoggedWork(session);
}

export type RecapProgressionPoint = {
  completedAt: number;
  weight: number;
  reps: number;
  est1RM: number;
  sameTemplate: boolean;
  samePlace: boolean;
};

export type RecapProgressionStory = {
  slug: string;
  scopedToTemplate: boolean;
  isBaseline: boolean;
  isInverseWeight: boolean;
  points: RecapProgressionPoint[];
  today: { weight: number; reps: number; est1RM: number } | null;
  previous: {
    weight: number;
    reps: number;
    est1RM: number;
    completedAt: number;
  } | null;
  vsPreviousWeight: number | null;
};

export type WorkoutRecap = {
  session: {
    templateName: string;
    startedAt: number;
    completedAt: number;
    sessionKind?: "tracked" | "health_summary";
    placeName?: string | null;
    sourceName?: string | null;
    activityType?: string | null;
    distanceMeters?: number | null;
    energyKcal?: number | null;
  };
  totals: {
    volume: number;
    durationMs: number;
    completedSets: number;
    exerciseCount: number;
  };
  standout: {
    slug: string;
    weight: number;
    reps: number;
    est1RM: number;
    isPr: boolean;
    priorBest: BestSet | null;
  } | null;
  muscleSets: Array<{ slug: string; sets: number }>;
  progressionStory: RecapProgressionStory | null;
  consistency: {
    sessionsThisWeek: number;
    weeklyGoal: number;
    weekStreak: number;
    /** Mon–Sun: true if at least one logged workout that day. */
    daysWorked: boolean[];
  };
};

const WEEKLY_GOAL = 4;
/** Points plotted in the progression beat. */
const PROGRESSION_POINTS = 7;

export function getLocalWorkoutRecap(
  all: LoadedSession[],
  sessionId: string,
): WorkoutRecap | null {
  const session = all.find((candidate) => candidate.sessionId === sessionId);
  if (!session) return null;

  const completedAt = session.completedAt;
  const doneSets = session.exercises.flatMap((exercise) =>
    exercise.sets.filter(isLoggedSet).map((set) => ({
      slug: exercise.slug,
      weight: set.weight,
      reps: set.reps,
    })),
  );
  const volume = doneSets.reduce((sum, set) => sum + set.weight * set.reps, 0);
  // Heavier weight wins; among weight-0 (bodyweight / unset) sets, more reps.
  // Assisted/counterweighted lifts invert that: less assistance is better.
  const standout =
    [...doneSets].sort((a, b) => compareRecapSets(b, a))[0] ?? null;

  // Everything up to and including today, oldest first, so the lineage below
  // reads left to right.
  const history = all
    .filter(
      (candidate) =>
        candidate.completedAt <= completedAt &&
        sessionCountsTowardGoals(candidate),
    )
    .sort((a, b) => a.completedAt - b.completedAt);

  const weekStart = startOfWeekMonday(completedAt);
  const weekEnd = weekStart + MS_PER_WEEK;
  const weekAts = history
    .map((candidate) => candidate.completedAt)
    .filter((ts) => ts >= weekStart && ts < weekEnd);
  const daysWorked = [false, false, false, false, false, false, false];
  for (const ts of weekAts) {
    const day = new Date(ts).getDay(); // 0 = Sun
    daysWorked[day === 0 ? 6 : day - 1] = true;
  }

  const allPoints: RecapProgressionPoint[] = [];
  let priorBest: BestSet | null = null;
  const homePlaceId: string | null = null;
  const placeId = session.placeId;
  if (standout) {
    const standoutInverseWeight = isInverseWeightSlug(standout.slug);
    for (const candidate of history) {
      const best = bestSetForSlug(candidate, standout.slug);
      if (!best) continue;
      const samePlace =
        !placeId ||
        (candidate.placeId ?? homePlaceId) === placeId ||
        (!candidate.placeId && !placeId);
      if (
        samePlace &&
        candidate.sessionId !== sessionId &&
        candidate.completedAt < completedAt
      ) {
        priorBest = betterBestSetForSlug(
          priorBest,
          best,
          standoutInverseWeight,
        );
      }
      allPoints.push({
        completedAt: candidate.completedAt,
        weight: best.weight,
        reps: best.reps,
        est1RM: best.est1RM,
        sameTemplate:
          session.templateId !== null &&
          candidate.templateId === session.templateId,
        samePlace,
      });
    }
  }

  const samePlacePoints = allPoints.filter((point) => point.samePlace);
  const sameTemplatePoints = samePlacePoints.filter(
    (point) => point.sameTemplate,
  );
  const scopedToTemplate = sameTemplatePoints.length >= 2;
  const lineagePoints = scopedToTemplate
    ? sameTemplatePoints
    : samePlacePoints.length >= 2
      ? samePlacePoints
      : allPoints;
  const points = lineagePoints.slice(-PROGRESSION_POINTS);
  const today = points[points.length - 1] ?? null;
  const previous = points.length >= 2 ? points[points.length - 2] : null;

  const isInverseWeight = standout ? isInverseWeightSlug(standout.slug) : false;

  return {
    session: {
      templateName: session.templateName,
      startedAt: session.startedAt,
      completedAt,
      sessionKind: session.sessionKind,
      placeName: session.placeName,
      sourceName: session.health?.sourceName ?? null,
      activityType: session.health?.activityType ?? null,
      distanceMeters: session.health?.distanceMeters ?? null,
      energyKcal: session.health?.energyKcal ?? null,
    },
    totals: {
      volume,
      durationMs:
        session.health?.durationSeconds != null
          ? session.health.durationSeconds * 1000
          : Math.max(0, completedAt - session.startedAt),
      completedSets: doneSets.length,
      exerciseCount: session.exercises.filter((exercise) =>
        exercise.sets.some(isLoggedSet),
      ).length,
    },
    standout: standout
      ? {
          slug: standout.slug,
          weight: standout.weight,
          reps: standout.reps,
          est1RM: estimate1RM(standout.weight, standout.reps),
          isPr: priorBest
            ? compareBestSetsForSlug(
                { weight: standout.weight, reps: standout.reps },
                priorBest,
                isInverseWeight,
              ) > 0
            : true,
          priorBest,
        }
      : null,
    muscleSets: session.exercises.map((exercise) => ({
      slug: exercise.slug,
      sets: exercise.sets.filter(isLoggedSet).length,
    })),
    progressionStory:
      standout && points.length > 0
        ? {
            slug: standout.slug,
            scopedToTemplate,
            isBaseline: points.length < 2,
            isInverseWeight,
            points,
            today: today
              ? { weight: today.weight, reps: today.reps, est1RM: today.est1RM }
              : null,
            previous: previous
              ? {
                  weight: previous.weight,
                  reps: previous.reps,
                  est1RM: previous.est1RM,
                  completedAt: previous.completedAt,
                }
              : null,
            vsPreviousWeight:
              today && previous ? today.weight - previous.weight : null,
          }
        : null,
    consistency: {
      sessionsThisWeek: weekAts.length,
      weeklyGoal: WEEKLY_GOAL,
      weekStreak: computeWeekStreak(
        history.map((candidate) => candidate.completedAt),
        completedAt,
      ),
      daysWorked,
    },
  };
}
