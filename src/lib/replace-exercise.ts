/** Shared replace-exercise policy for web, iOS, and Convex. */

export const REPLACED_EXERCISE_MAX_SETS = 20;

export type ReplacementSeed = { weight: number; reps: number };

export function replacementHasLoggedSets(
  sets: { completed?: boolean }[],
): boolean {
  return sets.some((set) => set.completed === true);
}

/**
 * Keep the current set count and copy the new lift's last load onto every
 * row. Bodyweight work seeds as 0; a weighted lift seeds from its last
 * logged (or remembered) set. Callers apply this onto existing set ids
 * rather than deleting rows.
 */
export function prescriptionsForReplacedExercise(
  setCount: number,
  seed: ReplacementSeed,
): ReplacementSeed[] {
  const count = Math.min(
    REPLACED_EXERCISE_MAX_SETS,
    Math.max(1, Math.round(setCount) || 1),
  );
  const weight = Math.max(0, Math.round(seed.weight) || 0);
  const reps = Math.max(0, Math.round(seed.reps) || 0);
  return Array.from({ length: count }, () => ({ weight, reps }));
}

export function replaceLoggedSetsMessage(newName: string): string {
  return `Logged weights and reps will reset for ${newName}. Checked sets in an active workout will be unchecked. Notes and stats follow ${newName}.`;
}
