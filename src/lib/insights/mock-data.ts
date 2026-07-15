import type { MuscleGroup } from "@/lib/exercises";
import type { InsightsDays } from "./format";
import { estimate1RM } from "./format";

export type MuscleVolume = {
  id: MuscleGroup;
  label: string;
  sets: number;
  pct: number;
};

export type TopLift = {
  slug: string;
  weight: number;
  sessions: number;
  est1RM: number;
  trend: "up" | "flat" | "down";
  group: MuscleGroup;
};

export type RecentSession = {
  id: string;
  name: string;
  completedAt: number;
  durationMinutes: number;
  volumeLb: number;
  summary: string;
};

export type OverviewStats = {
  workouts: number;
  durationMinutes: number;
  volumeLb: number;
  streakWeeks: number;
  muscles: MuscleVolume[];
  lifts: TopLift[];
  sessions: RecentSession[];
};

export type ExerciseSet = {
  weight: number;
  reps: number;
};

export type ExerciseSession = {
  id: string;
  workoutName: string;
  completedAt: number;
  sets: ExerciseSet[];
};

export type RepLadderEntry = {
  reps: number;
  bestWeight: number | null;
  bestReps: number | null;
  bestDate: number | null;
  predicted: number;
};

export type ExerciseRecords = {
  est1RM: number;
  bestWeight: number;
  bestReps: number;
  maxVolume: number;
  repLadder: RepLadderEntry[];
};

export type ExerciseInsightsData = {
  slug: string;
  sessions: ExerciseSession[];
  records: ExerciseRecords;
};

function muscleVolumes(
  entries: { id: MuscleGroup; label: string; sets: number }[],
): MuscleVolume[] {
  const total = entries.reduce((sum, e) => sum + e.sets, 0);
  return entries.map((e) => ({
    ...e,
    pct: total > 0 ? Math.round((e.sets / total) * 100) : 0,
  }));
}

const JUN_30 = new Date("2026-06-30T12:00:00").getTime();
const JUN_28 = new Date("2026-06-28T10:30:00").getTime();
const JUN_27 = new Date("2026-06-27T12:08:00").getTime();
const JUN_24 = new Date("2026-06-24T18:00:00").getTime();
const JUN_18 = new Date("2026-06-18T18:42:00").getTime();
const MAY_30 = new Date("2026-05-30T07:15:00").getTime();

export const MOCK_OVERVIEW_BY_DAYS: Record<InsightsDays, OverviewStats> = {
  "7": {
    workouts: 3,
    durationMinutes: 160,
    volumeLb: 41400,
    streakWeeks: 2,
    muscles: muscleVolumes([
      { id: "legs", label: "Legs", sets: 24 },
      { id: "chest", label: "Chest", sets: 18 },
      { id: "back", label: "Back", sets: 15 },
      { id: "shoulders", label: "Shoulders", sets: 9 },
      { id: "arms", label: "Arms", sets: 9 },
    ]),
    lifts: [
      {
        slug: "bench",
        weight: 185,
        sessions: 2,
        est1RM: 215,
        trend: "up",
        group: "chest",
      },
      {
        slug: "squat",
        weight: 225,
        sessions: 1,
        est1RM: 265,
        trend: "flat",
        group: "legs",
      },
      {
        slug: "deadlift",
        weight: 275,
        sessions: 1,
        est1RM: 315,
        trend: "up",
        group: "legs",
      },
    ],
    sessions: [
      {
        id: "s1",
        name: "Push Day",
        completedAt: JUN_30,
        durationMinutes: 52,
        volumeLb: 12400,
        summary: "Bench 3 · OHP 3 · Tri 3",
      },
      {
        id: "s2",
        name: "Leg Day",
        completedAt: JUN_28,
        durationMinutes: 60,
        volumeLb: 18200,
        summary: "Squat 5 · RDL 3 · Leg 3",
      },
      {
        id: "s3",
        name: "Upper",
        completedAt: JUN_27,
        durationMinutes: 48,
        volumeLb: 10800,
        summary: "Bench 3 · Row 3 · Pull 3",
      },
    ],
  },
  "30": {
    workouts: 8,
    durationMinutes: 252,
    volumeLb: 48200,
    streakWeeks: 3,
    muscles: muscleVolumes([
      { id: "legs", label: "Legs", sets: 48 },
      { id: "chest", label: "Chest", sets: 36 },
      { id: "back", label: "Back", sets: 33 },
      { id: "shoulders", label: "Shoulders", sets: 18 },
      { id: "arms", label: "Arms", sets: 18 },
    ]),
    lifts: [
      {
        slug: "bench",
        weight: 185,
        sessions: 4,
        est1RM: 215,
        trend: "up",
        group: "chest",
      },
      {
        slug: "squat",
        weight: 225,
        sessions: 3,
        est1RM: 265,
        trend: "flat",
        group: "legs",
      },
      {
        slug: "deadlift",
        weight: 275,
        sessions: 3,
        est1RM: 315,
        trend: "up",
        group: "legs",
      },
      {
        slug: "ohp",
        weight: 115,
        sessions: 2,
        est1RM: 128,
        trend: "down",
        group: "shoulders",
      },
      {
        slug: "barbell-row",
        weight: 155,
        sessions: 3,
        est1RM: 181,
        trend: "up",
        group: "back",
      },
    ],
    sessions: [
      {
        id: "s1",
        name: "Push Day",
        completedAt: JUN_30,
        durationMinutes: 52,
        volumeLb: 12400,
        summary: "Bench 3 · OHP 3 · Tri 3",
      },
      {
        id: "s2",
        name: "Leg Day",
        completedAt: JUN_28,
        durationMinutes: 60,
        volumeLb: 18200,
        summary: "Squat 5 · RDL 3 · Leg 3",
      },
      {
        id: "s3",
        name: "Upper",
        completedAt: JUN_27,
        durationMinutes: 48,
        volumeLb: 10800,
        summary: "Bench 3 · Row 3 · Pull 3",
      },
      {
        id: "s4",
        name: "Pull Day",
        completedAt: JUN_24,
        durationMinutes: 45,
        volumeLb: 9600,
        summary: "Dead 3 · Row 3 · Curl 3",
      },
      {
        id: "s5",
        name: "Push Day",
        completedAt: JUN_18,
        durationMinutes: 47,
        volumeLb: 11200,
        summary: "Bench 3 · OHP 3 · Tri 3",
      },
    ],
  },
  "90": {
    workouts: 24,
    durationMinutes: 720,
    volumeLb: 142800,
    streakWeeks: 3,
    muscles: muscleVolumes([
      { id: "legs", label: "Legs", sets: 120 },
      { id: "chest", label: "Chest", sets: 96 },
      { id: "back", label: "Back", sets: 90 },
      { id: "shoulders", label: "Shoulders", sets: 48 },
      { id: "arms", label: "Arms", sets: 48 },
    ]),
    lifts: [
      {
        slug: "bench",
        weight: 185,
        sessions: 12,
        est1RM: 215,
        trend: "up",
        group: "chest",
      },
      {
        slug: "squat",
        weight: 225,
        sessions: 10,
        est1RM: 265,
        trend: "up",
        group: "legs",
      },
      {
        slug: "deadlift",
        weight: 275,
        sessions: 9,
        est1RM: 315,
        trend: "up",
        group: "legs",
      },
    ],
    sessions: [
      {
        id: "s1",
        name: "Push Day",
        completedAt: JUN_30,
        durationMinutes: 52,
        volumeLb: 12400,
        summary: "Bench 3 · OHP 3 · Tri 3",
      },
      {
        id: "s2",
        name: "Leg Day",
        completedAt: JUN_28,
        durationMinutes: 60,
        volumeLb: 18200,
        summary: "Squat 5 · RDL 3 · Leg 3",
      },
    ],
  },
  all: {
    workouts: 47,
    durationMinutes: 1440,
    volumeLb: 284500,
    streakWeeks: 3,
    muscles: muscleVolumes([
      { id: "legs", label: "Legs", sets: 220 },
      { id: "chest", label: "Chest", sets: 176 },
      { id: "back", label: "Back", sets: 165 },
      { id: "shoulders", label: "Shoulders", sets: 88 },
      { id: "arms", label: "Arms", sets: 88 },
    ]),
    lifts: [
      {
        slug: "bench",
        weight: 185,
        sessions: 22,
        est1RM: 215,
        trend: "up",
        group: "chest",
      },
      {
        slug: "squat",
        weight: 225,
        sessions: 18,
        est1RM: 265,
        trend: "up",
        group: "legs",
      },
    ],
    sessions: [
      {
        id: "s1",
        name: "Push Day",
        completedAt: JUN_30,
        durationMinutes: 52,
        volumeLb: 12400,
        summary: "Bench 3 · OHP 3 · Tri 3",
      },
    ],
  },
};

const BENCH_1RM = estimate1RM(135, 8);

function buildRepLadder(oneRm: number): RepLadderEntry[] {
  return Array.from({ length: 10 }, (_, i) => {
    const reps = i + 1;
    const predicted = Math.round(oneRm / (1 + reps / 30));
    let bestWeight: number | null = null;
    let bestReps: number | null = null;
    let bestDate: number | null = null;
    if (reps === 6 || reps === 8) {
      bestWeight = 135;
      bestReps = 8;
      bestDate = JUN_27;
    }
    return { reps, bestWeight, bestReps, bestDate, predicted };
  });
}

export const MOCK_EXERCISE_DATA: Record<string, ExerciseInsightsData> = {
  bench: {
    slug: "bench",
    sessions: [
      {
        id: "bench-1",
        workoutName: "Push Day",
        completedAt: JUN_27,
        sets: [
          { weight: 135, reps: 8 },
          { weight: 135, reps: 8 },
          { weight: 135, reps: 8 },
        ],
      },
      {
        id: "bench-2",
        workoutName: "Upper",
        completedAt: JUN_18,
        sets: [
          { weight: 130, reps: 8 },
          { weight: 130, reps: 8 },
          { weight: 125, reps: 8 },
        ],
      },
      {
        id: "bench-3",
        workoutName: "Push Day",
        completedAt: MAY_30,
        sets: [
          { weight: 125, reps: 8 },
          { weight: 125, reps: 8 },
          { weight: 125, reps: 7 },
        ],
      },
    ],
    records: {
      est1RM: BENCH_1RM,
      bestWeight: 135,
      bestReps: 8,
      maxVolume: 1080,
      repLadder: buildRepLadder(BENCH_1RM),
    },
  },
  squat: {
    slug: "squat",
    sessions: [
      {
        id: "squat-1",
        workoutName: "Leg Day",
        completedAt: JUN_28,
        sets: [
          { weight: 185, reps: 5 },
          { weight: 205, reps: 5 },
          { weight: 225, reps: 5 },
          { weight: 225, reps: 5 },
          { weight: 225, reps: 5 },
        ],
      },
      {
        id: "squat-2",
        workoutName: "Leg Day",
        completedAt: JUN_18,
        sets: [
          { weight: 185, reps: 5 },
          { weight: 205, reps: 5 },
          { weight: 215, reps: 5 },
          { weight: 215, reps: 5 },
        ],
      },
    ],
    records: {
      est1RM: estimate1RM(225, 5),
      bestWeight: 225,
      bestReps: 5,
      maxVolume: 3375,
      repLadder: buildRepLadder(estimate1RM(225, 5)),
    },
  },
};
