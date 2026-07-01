import type { MuscleGroup } from "@/lib/exercises";

export type MuscleVolume = {
  id: MuscleGroup;
  label: string;
  volumeLb: number;
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
  bestEst1RM: number;
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
