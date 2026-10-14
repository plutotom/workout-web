import type { SessionInputMode } from "@shared/note-workouts";

import type {
  LocalGeneralPreferencePatch,
  LocalGeneralPreferences,
  LocalPreferences,
} from "./types";

/** Set while a Settings write is waiting for Convex to echo through bootstrap. */
export const GENERAL_PREFS_ECHO_PENDING_KEY = "general_prefs_echo_pending";
export const GENERAL_PREFS_OPERATION_KEY = "general_prefs_operation_id";

const GENERAL_PREFERENCE_KEYS = [
  "unit",
  "barWeightLb",
  "barWeightKg",
  "activeWorkoutMode",
  "restTimerEnabled",
] as const satisfies readonly (keyof LocalGeneralPreferences)[];

export function mergeGeneralPreferences(
  current: LocalPreferences,
  patch: LocalGeneralPreferencePatch,
): LocalPreferences {
  return { ...current, ...patch };
}

export function normalizeGeneralPreferencePatch(
  patch: LocalGeneralPreferencePatch,
): LocalGeneralPreferencePatch {
  const normalized = { ...patch };
  for (const key of ["barWeightLb", "barWeightKg"] as const) {
    const weight = normalized[key];
    if (weight === undefined) continue;
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error("Bar weight must be a finite, non-negative number");
    }
    normalized[key] = Math.round(weight);
  }
  return normalized;
}

export function pickGeneralPreferences(
  preferences: LocalPreferences,
): LocalGeneralPreferences {
  return {
    unit: preferences.unit,
    barWeightLb: preferences.barWeightLb,
    barWeightKg: preferences.barWeightKg,
    activeWorkoutMode: preferences.activeWorkoutMode,
    restTimerEnabled: preferences.restTimerEnabled,
  };
}

export function normalizeCloudGeneralPreferences(cloud: {
  unit: LocalGeneralPreferences["unit"];
  barWeightLb: number | null;
  barWeightKg: number | null;
  activeWorkoutMode: LocalGeneralPreferences["activeWorkoutMode"];
  restTimerEnabled: boolean;
}): LocalGeneralPreferences {
  return {
    unit: cloud.unit,
    barWeightLb: cloud.barWeightLb ?? 45,
    barWeightKg: cloud.barWeightKg ?? 20,
    activeWorkoutMode: cloud.activeWorkoutMode === "focus" ? "focus" : "list",
    restTimerEnabled: cloud.restTimerEnabled,
  };
}

/** Bind order for `local_preferences` general columns (and `updated_at`). */
export function generalPreferenceBindValues(
  preferences: LocalGeneralPreferences,
  updatedAt: number,
) {
  return [
    preferences.unit,
    preferences.barWeightLb,
    preferences.barWeightKg,
    preferences.activeWorkoutMode,
    preferences.restTimerEnabled ? 1 : 0,
    updatedAt,
  ] as const;
}

/**
 * Live workout chrome. List vs Focus is a phone preference, so the session
 * screen must follow SQLite even when Settings has already saved the same
 * choice to Convex.
 */
export function inProgressWorkoutLayout(
  inputMode: SessionInputMode | undefined,
  activeWorkoutMode: LocalPreferences["activeWorkoutMode"],
): "note" | "list" | "focus" {
  if (inputMode === "note") return "note";
  return activeWorkoutMode === "focus" ? "focus" : "list";
}

export function mergeEchoPendingPatch(
  pending: LocalGeneralPreferencePatch | null,
  patch: LocalGeneralPreferencePatch,
): LocalGeneralPreferencePatch {
  return { ...pending, ...patch };
}

export function parseEchoPendingPatch(
  raw: string | null | undefined,
): LocalGeneralPreferencePatch | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const patch: LocalGeneralPreferencePatch = {};
    if (record.unit === "lb" || record.unit === "kg") patch.unit = record.unit;
    if (
      typeof record.barWeightLb === "number" &&
      Number.isFinite(record.barWeightLb)
    ) {
      patch.barWeightLb = record.barWeightLb;
    }
    if (
      typeof record.barWeightKg === "number" &&
      Number.isFinite(record.barWeightKg)
    ) {
      patch.barWeightKg = record.barWeightKg;
    }
    if (
      record.activeWorkoutMode === "list" ||
      record.activeWorkoutMode === "focus"
    ) {
      patch.activeWorkoutMode = record.activeWorkoutMode;
    }
    if (typeof record.restTimerEnabled === "boolean") {
      patch.restTimerEnabled = record.restTimerEnabled;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  } catch {
    return null;
  }
}

export function serializeEchoPendingPatch(
  pending: LocalGeneralPreferencePatch | null,
): string | null {
  if (!pending) return null;
  const clean: LocalGeneralPreferencePatch = {};
  for (const key of GENERAL_PREFERENCE_KEYS) {
    const value = pending[key];
    if (value !== undefined) {
      (clean as Record<string, unknown>)[key] = value;
    }
  }
  return Object.keys(clean).length > 0 ? JSON.stringify(clean) : null;
}

/**
 * Keep local edits until bootstrap acknowledges their operation, even if an
 * older cloud snapshot happens to contain the intended value already. An
 * acknowledgment can retire the guard without requiring an exact value echo.
 * Fields the phone did not edit continue to adopt cloud values.
 */
export function resolveBootstrappedGeneralPreferences({
  pending,
  local,
  cloud,
  acknowledged = false,
}: {
  pending: LocalGeneralPreferencePatch | null;
  local: LocalGeneralPreferences;
  cloud: LocalGeneralPreferences;
  acknowledged?: boolean;
}): {
  next: LocalGeneralPreferences;
  remainingPending: LocalGeneralPreferencePatch | null;
} {
  if (!pending || acknowledged) {
    return { next: cloud, remainingPending: null };
  }

  const next: LocalGeneralPreferences = { ...cloud };
  const remaining: LocalGeneralPreferencePatch = {};
  for (const key of GENERAL_PREFERENCE_KEYS) {
    const intended = pending[key];
    if (intended === undefined) continue;
    Object.assign(next, { [key]: local[key] });
    Object.assign(remaining, { [key]: intended });
  }

  return {
    next,
    remainingPending: Object.keys(remaining).length > 0 ? remaining : null,
  };
}
