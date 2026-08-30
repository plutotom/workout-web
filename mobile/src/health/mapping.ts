import {
  multiSportDisplayName,
  parseHealthSegments,
  type HealthWorkoutSegment,
} from "@shared/health-summary";

import type {
  HealthQuantity,
  HealthWorkoutSample,
  HealthWorkoutSummary,
} from "./types";

export {
  formatHealthDistance,
  formatHealthEnergy,
  formatHealthHistoryLine,
  formatHealthSportLine,
} from "@shared/health-summary";
export type { HealthWorkoutSegment } from "@shared/health-summary";

export const HEALTH_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
export const HEALTH_QUERY_PAGE_SIZE = 100;
export const APP_BUNDLE_ID = "com.isaiahproctor.workout.local";
export const WATCH_BUNDLE_ID = `${APP_BUNDLE_ID}.watchkitapp`;
export const HEALTH_EXPORT_ACTIVITY_TYPE = "traditionalStrengthTraining";
export const HEALTH_EXPORT_ACTIVITY_CODE = 50;
export const HEALTH_EXPORT_SOURCE_NAME = "Grayed Lift";
export const HEALTH_SYNC_IDENTIFIER_PREFIX = `${APP_BUNDLE_ID}:session:`;

type ActivityMeta = {
  type: string;
  name: string;
  symbol: string;
  strength?: boolean;
};

/**
 * Apple `HKWorkoutActivityType` raw values plus the names
 * `@kingstinct/react-native-healthkit` exposes. Unknown types fall back to
 * a generic activity rather than inventing a lift.
 */
const ACTIVITY_BY_CODE: Record<number, ActivityMeta> = {
  1: {
    type: "americanFootball",
    name: "American Football",
    symbol: "figure.american.football",
  },
  2: { type: "archery", name: "Archery", symbol: "figure.archery" },
  3: {
    type: "australianFootball",
    name: "Australian Football",
    symbol: "figure.australian.football",
  },
  4: { type: "badminton", name: "Badminton", symbol: "figure.badminton" },
  5: { type: "baseball", name: "Baseball", symbol: "figure.baseball" },
  6: { type: "basketball", name: "Basketball", symbol: "figure.basketball" },
  7: { type: "bowling", name: "Bowling", symbol: "figure.bowling" },
  8: { type: "boxing", name: "Boxing", symbol: "figure.boxing" },
  9: { type: "climbing", name: "Climbing", symbol: "figure.climbing" },
  10: { type: "cricket", name: "Cricket", symbol: "figure.cricket" },
  11: {
    type: "crossTraining",
    name: "Cross Training",
    symbol: "figure.cross.training",
  },
  12: { type: "curling", name: "Curling", symbol: "figure.curling" },
  13: { type: "cycling", name: "Ride", symbol: "bicycle" },
  14: { type: "dance", name: "Dance", symbol: "figure.dance" },
  16: { type: "elliptical", name: "Elliptical", symbol: "figure.elliptical" },
  20: {
    type: "functionalStrengthTraining",
    name: "Strength",
    symbol: "dumbbell",
    strength: true,
  },
  21: { type: "golf", name: "Golf", symbol: "figure.golf" },
  24: { type: "hiking", name: "Hike", symbol: "figure.hiking" },
  27: {
    type: "martialArts",
    name: "Martial Arts",
    symbol: "figure.martial.arts",
  },
  35: { type: "rowing", name: "Row", symbol: "figure.rower" },
  37: { type: "running", name: "Run", symbol: "figure.run" },
  46: { type: "swimming", name: "Swim", symbol: "figure.pool.swim" },
  50: {
    type: "traditionalStrengthTraining",
    name: "Strength",
    symbol: "dumbbell",
    strength: true,
  },
  52: { type: "walking", name: "Walk", symbol: "figure.walk" },
  57: { type: "yoga", name: "Yoga", symbol: "figure.yoga" },
  58: { type: "barre", name: "Barre", symbol: "figure.barre" },
  59: {
    type: "coreTraining",
    name: "Core",
    symbol: "figure.core.training",
    strength: true,
  },
  63: {
    type: "highIntensityIntervalTraining",
    name: "HIIT",
    symbol: "figure.highintensity.intervaltraining",
  },
  64: { type: "jumpRope", name: "Jump Rope", symbol: "figure.jumprope" },
  66: { type: "pilates", name: "Pilates", symbol: "figure.pilates" },
  68: { type: "stairs", name: "Stairs", symbol: "figure.stairs" },
  73: { type: "mixedCardio", name: "Cardio", symbol: "figure.mixed.cardio" },
  80: { type: "socialDance", name: "Dance", symbol: "figure.socialdance" },
  82: {
    type: "swimBikeRun",
    name: "Triathlon",
    symbol: "figure.mixed.cardio",
  },
  83: {
    type: "transition",
    name: "Transition",
    symbol: "figure.flexibility",
  },
  3000: { type: "other", name: "Workout", symbol: "figure.mixed.cardio" },
};

const ACTIVITY_BY_NAME: Record<string, ActivityMeta> = Object.fromEntries(
  Object.values(ACTIVITY_BY_CODE).map((meta) => [meta.type, meta]),
);

const FALLBACK_ACTIVITY: ActivityMeta = {
  type: "other",
  name: "Workout",
  symbol: "figure.mixed.cardio",
};

const STRENGTH_TYPES = new Set(
  Object.values(ACTIVITY_BY_CODE)
    .filter((meta) => meta.strength)
    .map((meta) => meta.type),
);

function camelFromPascal(value: string) {
  return value.replace(/^[A-Z]/, (letter) => letter.toLowerCase());
}

export function resolveActivityMeta(
  raw: string | number | null | undefined,
): ActivityMeta {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return ACTIVITY_BY_CODE[raw] ?? FALLBACK_ACTIVITY;
  }
  if (typeof raw !== "string" || raw.length === 0) return FALLBACK_ACTIVITY;
  if (/^\d+$/.test(raw)) {
    return ACTIVITY_BY_CODE[Number(raw)] ?? FALLBACK_ACTIVITY;
  }
  const key = camelFromPascal(raw.trim());
  return ACTIVITY_BY_NAME[key] ?? FALLBACK_ACTIVITY;
}

export function isStrengthActivityType(activityType: string) {
  return STRENGTH_TYPES.has(activityType);
}

export function toEpochMs(value: Date | string | number | null | undefined) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function quantityUnit(value: HealthQuantity | number | null | undefined) {
  if (typeof value === "number") return { quantity: value, unit: "" };
  if (!value || !Number.isFinite(value.quantity)) return null;
  return { quantity: value.quantity, unit: value.unit.trim().toLowerCase() };
}

export function durationSecondsFromSample(
  sample: Pick<HealthWorkoutSample, "duration" | "startDate" | "endDate">,
) {
  const duration = quantityUnit(sample.duration ?? null);
  if (duration) {
    if (duration.unit === "min" || duration.unit === "minute") {
      return Math.max(0, duration.quantity * 60);
    }
    if (
      duration.unit === "hr" ||
      duration.unit === "hour" ||
      duration.unit === "h"
    ) {
      return Math.max(0, duration.quantity * 3600);
    }
    if (duration.unit === "ms") return Math.max(0, duration.quantity / 1000);
    return Math.max(0, duration.quantity);
  }
  const startedAt = toEpochMs(sample.startDate);
  const endedAt = toEpochMs(sample.endDate);
  return Math.max(0, (endedAt - startedAt) / 1000);
}

export function distanceMetersFromQuantity(
  value: HealthQuantity | null | undefined,
) {
  const quantity = quantityUnit(value);
  if (!quantity || quantity.quantity <= 0) return null;
  const unit = quantity.unit;
  if (unit === "m" || unit === "meter" || unit === "meters" || unit === "") {
    return quantity.quantity;
  }
  if (unit === "km" || unit === "kilometer" || unit === "kilometers") {
    return quantity.quantity * 1000;
  }
  if (unit === "mi" || unit === "mile" || unit === "miles") {
    return quantity.quantity * 1609.344;
  }
  if (unit === "yd" || unit === "yard" || unit === "yards") {
    return quantity.quantity * 0.9144;
  }
  if (unit === "ft" || unit === "foot" || unit === "feet") {
    return quantity.quantity * 0.3048;
  }
  return quantity.quantity;
}

export function energyKcalFromQuantity(
  value: HealthQuantity | null | undefined,
) {
  const quantity = quantityUnit(value);
  if (!quantity || quantity.quantity <= 0) return null;
  const unit = quantity.unit;
  if (
    unit === "kcal" ||
    unit === "cal" ||
    unit === "kilocalorie" ||
    unit === ""
  ) {
    return quantity.quantity;
  }
  if (unit === "kj" || unit === "kilojoule") return quantity.quantity / 4.184;
  if (unit === "j" || unit === "joule") return quantity.quantity / 4184;
  return quantity.quantity;
}

function sourceFromSample(sample: HealthWorkoutSample) {
  const nested = sample.sourceRevision?.source;
  return {
    name: sample.sourceName ?? nested?.name ?? null,
    bundleId: sample.sourceBundleId ?? nested?.bundleIdentifier ?? null,
  };
}

export function healthSyncIdentifier(sessionId: string) {
  return `${HEALTH_SYNC_IDENTIFIER_PREFIX}${sessionId}`;
}

export function syncIdentifierFromSample(sample: HealthWorkoutSample) {
  const value = sample.metadata?.HKMetadataKeySyncIdentifier;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isAppAuthoredHealthWorkout(
  workout: {
    sourceBundleId?: string | null;
    syncIdentifier?: string | null;
  },
  appBundleId: string,
) {
  if (
    workout.sourceBundleId &&
    (workout.sourceBundleId === appBundleId ||
      workout.sourceBundleId === WATCH_BUNDLE_ID ||
      workout.sourceBundleId === `${appBundleId}.watchkitapp`)
  ) {
    return true;
  }
  const syncId = workout.syncIdentifier;
  return Boolean(syncId && syncId.startsWith(`${appBundleId}:session:`));
}

export function isMultiSportActivityType(activityType: string) {
  return activityType === "swimBikeRun";
}

function rawActivityTypeFromUnknown(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.workoutActivityType === "string" ||
    typeof record.workoutActivityType === "number"
  ) {
    return record.workoutActivityType;
  }
  if (
    typeof record.activityType === "string" ||
    typeof record.activityType === "number"
  ) {
    return record.activityType;
  }
  const config = record.workoutConfiguration;
  if (config && typeof config === "object") {
    const activityType = (config as { activityType?: unknown }).activityType;
    if (typeof activityType === "string" || typeof activityType === "number") {
      return activityType;
    }
  }
  return null;
}

function quantityFromUnknown(value: unknown): HealthQuantity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    quantity?: unknown;
    value?: unknown;
    unit?: unknown;
  };
  const amount =
    typeof record.quantity === "number"
      ? record.quantity
      : typeof record.value === "number"
        ? record.value
        : null;
  if (amount == null || !Number.isFinite(amount)) return null;
  return {
    quantity: amount,
    unit: typeof record.unit === "string" ? record.unit : "",
  };
}

function segmentFromRawActivity(value: unknown): HealthWorkoutSegment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown> & {
    startDate?: unknown;
    endDate?: unknown;
    duration?: unknown;
    totalDistance?: unknown;
    totalEnergyBurned?: unknown;
  };
  const startedAt = toEpochMs(
    record.startDate as Date | string | number | null | undefined,
  );
  const endedAt = toEpochMs(
    record.endDate as Date | string | number | null | undefined,
  );
  if (startedAt <= 0 || endedAt < startedAt) return null;
  const rawType = rawActivityTypeFromUnknown(record);
  const meta = rawType == null ? null : resolveActivityMeta(rawType);
  const typed = Boolean(meta && meta.type !== "other");
  const duration =
    typeof record.duration === "number" && Number.isFinite(record.duration)
      ? Math.max(0, record.duration)
      : durationSecondsFromSample({
          duration: record.duration as HealthQuantity | number | null,
          startDate: startedAt,
          endDate: endedAt,
        });
  return {
    activityType: typed ? meta!.type : "other",
    activityName: typed ? meta!.name : "Split",
    startedAt,
    endedAt,
    durationSeconds: duration,
    distanceMeters: distanceMetersFromQuantity(
      quantityFromUnknown(record.totalDistance) ??
        quantityFromUnknown(record.distance),
    ),
    energyKcal: energyKcalFromQuantity(
      quantityFromUnknown(record.totalEnergyBurned) ??
        quantityFromUnknown(record.energyBurned),
    ),
  };
}

/** Native patch writes typed triathlon legs here. The library's
 *  `activities` type only has uuid / dates / duration. */
export const HEALTH_ACTIVITY_LEGS_METADATA_KEY = "WorkoutActivityLegs";

function metadataRecord(
  metadata: HealthWorkoutSample["metadata"],
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

function legsFromMetadata(metadata: HealthWorkoutSample["metadata"]) {
  const record = metadataRecord(metadata);
  if (!record) return [];
  const raw = record[HEALTH_ACTIVITY_LEGS_METADATA_KEY];
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function applyMultiSportSegmentNames(
  parentType: string,
  segments: HealthWorkoutSegment[],
) {
  if (parentType !== "swimBikeRun") return segments;
  return segments.map((segment) =>
    segment.activityType === "cycling"
      ? { ...segment, activityName: "Bike" }
      : segment,
  );
}

export function segmentsFromHealthSample(sample: HealthWorkoutSample) {
  const fromMeta = legsFromMetadata(sample.metadata);
  const raw =
    fromMeta.length > 0
      ? fromMeta
      : (sample.activities ?? sample.workoutActivities);
  if (!Array.isArray(raw)) return [];
  const parent = resolveActivityMeta(sample.workoutActivityType);
  return applyMultiSportSegmentNames(
    parent.type,
    parseHealthSegments(
      raw
        .map(segmentFromRawActivity)
        .filter((segment): segment is HealthWorkoutSegment => Boolean(segment))
        .sort((a, b) => a.startedAt - b.startedAt),
    ),
  );
}

export function normalizeHealthWorkout(
  sample: HealthWorkoutSample,
): HealthWorkoutSummary | null {
  const uuid = sample.uuid?.trim();
  if (!uuid) return null;
  const startedAt = toEpochMs(sample.startDate);
  const endedAt = toEpochMs(sample.endDate);
  if (startedAt <= 0 || endedAt < startedAt) return null;
  const meta = resolveActivityMeta(sample.workoutActivityType);
  const source = sourceFromSample(sample);
  const segments = segmentsFromHealthSample(sample);
  const activityName = multiSportDisplayName(meta.type, segments) ?? meta.name;
  return {
    uuid,
    activityType: meta.type,
    activityName,
    symbolName: meta.symbol,
    startedAt,
    endedAt,
    durationSeconds: durationSecondsFromSample(sample),
    distanceMeters: distanceMetersFromQuantity(sample.totalDistance),
    energyKcal: energyKcalFromQuantity(sample.totalEnergyBurned),
    sourceName: source.name,
    sourceBundleId: source.bundleId,
    syncIdentifier: syncIdentifierFromSample(sample),
    segments,
  };
}
