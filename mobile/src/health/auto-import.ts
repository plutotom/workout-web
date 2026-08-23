import {
  HEALTH_LOOKBACK_MS,
  isAppAuthoredHealthWorkout,
  isStrengthActivityType,
} from "./mapping";
import { findLikelyHealthOverlap, type TimeRange } from "./overlap";
import type { HealthAutoImportPrefs, HealthWorkoutSummary } from "./types";

export const DEFAULT_AUTO_IMPORT_TYPES = [
  "running",
  "walking",
  "cycling",
  "swimming",
] as const;

export const AUTO_IMPORT_TYPE_OPTIONS = [
  { type: "running", name: "Run" },
  { type: "walking", name: "Walk" },
  { type: "cycling", name: "Ride" },
  { type: "swimming", name: "Swim" },
  { type: "hiking", name: "Hike" },
  { type: "traditionalStrengthTraining", name: "Strength" },
  { type: "highIntensityIntervalTraining", name: "HIIT" },
  { type: "rowing", name: "Row" },
  { type: "yoga", name: "Yoga" },
] as const;

export const DEFAULT_HEALTH_AUTO_IMPORT_PREFS: HealthAutoImportPrefs = {
  enabled: false,
  importAllTypes: false,
  types: [...DEFAULT_AUTO_IMPORT_TYPES],
};

/** Notify only for workouts that just finished, not a 90-day catch-up dump. */
export const AUTO_IMPORT_NOTIFY_WINDOW_MS = 2 * 60 * 60 * 1000;

export type AutoImportSkipReason =
  | "disabled"
  | "filter"
  | "duplicate"
  | "ignored"
  | "overlap"
  | "app_authored"
  | "too_old";

export type AutoImportDecision =
  | { action: "import" }
  | { action: "skip"; reason: AutoImportSkipReason };

export function parseStoredAutoImportTypes(
  raw: string | null,
): string[] | null {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

export function parseHealthAutoImportPrefs(stored: {
  enabled: string | null;
  importAll: string | null;
  types: string | null;
}): HealthAutoImportPrefs {
  return {
    enabled: stored.enabled === "1",
    importAllTypes: stored.importAll === "1",
    types: parseStoredAutoImportTypes(stored.types) ?? [
      ...DEFAULT_AUTO_IMPORT_TYPES,
    ],
  };
}

export function activityMatchesSelectedType(
  activityType: string,
  selectedType: string,
) {
  if (selectedType === "traditionalStrengthTraining") {
    return isStrengthActivityType(activityType);
  }
  return activityType === selectedType;
}

export function workoutPassesAutoImportFilter(
  workout: Pick<HealthWorkoutSummary, "activityType">,
  prefs: HealthAutoImportPrefs,
) {
  if (!prefs.enabled) return false;
  if (prefs.importAllTypes) return true;
  return prefs.types.some((type) =>
    activityMatchesSelectedType(workout.activityType, type),
  );
}

export function shouldNotifyAutoImport(
  workout: Pick<HealthWorkoutSummary, "endedAt">,
  now = Date.now(),
) {
  return now - workout.endedAt <= AUTO_IMPORT_NOTIFY_WINDOW_MS;
}

export function autoImportNotificationCopy(
  workouts: Array<
    Pick<HealthWorkoutSummary, "activityName" | "durationSeconds">
  >,
) {
  if (workouts.length === 1) {
    const workout = workouts[0]!;
    const minutes = Math.max(0, Math.round(workout.durationSeconds / 60));
    const duration =
      minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
    return {
      title: `${workout.activityName} imported`,
      body: `${duration} from Apple Health.`,
    };
  }
  return {
    title: "Workouts imported",
    body: `${workouts.length} workouts from Apple Health.`,
  };
}

export function decideAutoImport(input: {
  workout: HealthWorkoutSummary;
  prefs: HealthAutoImportPrefs;
  imported: ReadonlySet<string>;
  ignored: ReadonlySet<string>;
  overlapCandidates: TimeRange[];
  appBundleId: string;
  now?: number;
  lookbackMs?: number;
}): AutoImportDecision {
  const now = input.now ?? Date.now();
  const lookbackMs = input.lookbackMs ?? HEALTH_LOOKBACK_MS;
  if (!input.prefs.enabled) return { action: "skip", reason: "disabled" };
  if (isAppAuthoredHealthWorkout(input.workout, input.appBundleId)) {
    return { action: "skip", reason: "app_authored" };
  }
  if (input.imported.has(input.workout.uuid)) {
    return { action: "skip", reason: "duplicate" };
  }
  if (input.ignored.has(input.workout.uuid)) {
    return { action: "skip", reason: "ignored" };
  }
  if (now - input.workout.startedAt > lookbackMs) {
    return { action: "skip", reason: "too_old" };
  }
  if (!workoutPassesAutoImportFilter(input.workout, input.prefs)) {
    return { action: "skip", reason: "filter" };
  }
  if (
    isStrengthActivityType(input.workout.activityType) &&
    findLikelyHealthOverlap(
      {
        startedAt: input.workout.startedAt,
        completedAt: input.workout.endedAt,
      },
      input.overlapCandidates,
    )
  ) {
    return { action: "skip", reason: "overlap" };
  }
  return { action: "import" };
}

export function toHealthSummaryImport(workout: HealthWorkoutSummary) {
  return {
    uuid: workout.uuid,
    activityType: workout.activityType,
    activityName: workout.activityName,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationSeconds: workout.durationSeconds,
    energyKcal: workout.energyKcal,
    distanceMeters: workout.distanceMeters,
    sourceName: workout.sourceName,
    sourceBundleId: workout.sourceBundleId,
  };
}
