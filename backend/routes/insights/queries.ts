import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";
import {
  getExerciseHistory,
  getExerciseRecords,
  getLifts,
  getOverview,
  getSessionHistory,
} from "../../lib/insights";

export const insightsDaysValidator = v.union(
  v.literal(7),
  v.literal(30),
  v.literal(90),
  v.null(),
);

const emptyOverview = {
  stats: {
    workoutCount: 0,
    totalDurationMs: 0,
    totalVolume: 0,
    priorTotalVolume: 0,
    weekStreak: 0,
  },
  volumeTrend: [] as { start: number; volume: number }[],
  volumeBySlug: [] as { slug: string; volume: number }[],
  topLifts: [] as {
    slug: string;
    sessionCount: number;
    bestWeight: number;
    bestReps: number;
    est1RM: number;
    trend: "up" | "flat" | "down";
  }[],
  recentSessions: [] as {
    sessionId: string;
    templateName: string;
    completedAt: number;
    durationMs: number;
    volume: number;
    exercises: { slug: string; completedCount: number }[];
  }[],
};

/** Aggregated insights for the overview tab (stats, volume, top lifts, recent sessions). */
export const overview = query({
  args: { days: insightsDaysValidator },
  handler: async (ctx, { days }) => {
    const user = await getUser(ctx);
    if (!user) return emptyOverview;
    return getOverview(ctx, user._id, days);
  },
});

/** All lifts in a time range, ranked by estimated 1RM. */
export const lifts = query({
  args: { days: insightsDaysValidator },
  handler: async (ctx, { days }) => {
    const user = await getUser(ctx);
    if (!user) return [];
    return getLifts(ctx, user._id, days);
  },
});

/** All completed sessions in a time range, newest first. */
export const sessionHistory = query({
  args: { days: insightsDaysValidator },
  handler: async (ctx, { days }) => {
    const user = await getUser(ctx);
    if (!user) return [];
    return getSessionHistory(ctx, user._id, days);
  },
});

/** Month-groupable session history for one exercise within a time range. */
export const exerciseHistory = query({
  args: { slug: v.string(), days: insightsDaysValidator },
  handler: async (ctx, { slug, days }) => {
    const user = await getUser(ctx);
    if (!user) return { sessions: [] };
    return getExerciseHistory(ctx, user._id, slug, days);
  },
});

/** All-time personal records and rep ladder for one exercise. */
export const exerciseRecords = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const user = await getUser(ctx);
    if (!user) {
      return {
        est1RM: 0,
        bestWeight: 0,
        bestReps: 0,
        bestWeightDate: 0,
        maxVolume: 0,
        repLadder: Array.from({ length: 10 }, (_, i) => ({
          reps: i + 1,
          bestWeight: null as number | null,
          bestReps: null as number | null,
          bestDate: null as number | null,
          predicted: 0,
        })),
      };
    }
    return getExerciseRecords(ctx, user._id, slug);
  },
});
