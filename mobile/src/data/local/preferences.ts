import type { SessionInputMode } from "@shared/note-workouts";

import type { LocalGeneralPreferencePatch, LocalPreferences } from "./types";

export function mergeGeneralPreferences(
  current: LocalPreferences,
  patch: LocalGeneralPreferencePatch,
): LocalPreferences {
  return { ...current, ...patch };
}

/** Bind order for `local_preferences` general columns (and `updated_at`). */
export function generalPreferenceBindValues(
  preferences: LocalPreferences,
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
