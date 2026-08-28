export const DEFAULT_SET_ROWS = 3;
export const MAX_SETS_PER_EXERCISE = 20;

export type LocalSetPreset = { weight: number; reps: number };

/**
 * Manual add copies the last logged seed across 3 rows. AI drafts bring their
 * own presets (e.g. 4×8) and those should win.
 */
export function setRowsForNewExercise(
  presets: LocalSetPreset[] | undefined,
  seed: LocalSetPreset,
): LocalSetPreset[] {
  if (presets && presets.length > 0) {
    return presets.slice(0, MAX_SETS_PER_EXERCISE).map((set) => ({
      weight: Math.max(0, Math.round(set.weight)),
      reps: Math.max(0, Math.round(set.reps)),
    }));
  }
  return Array.from({ length: DEFAULT_SET_ROWS }, () => ({
    weight: seed.weight,
    reps: seed.reps,
  }));
}
