/**
 * Convex copy of src/lib/place-memory.ts — keep the two in sync.
 * Convex functions cannot import from src/.
 */

export const DEFAULT_MACHINE_KEY = "default";
export const USUAL_MACHINE_NAME = "Usual";
export const HOME_PLACE_NAME = "Home";
export const MAX_PLACES = 20;
export const MAX_MACHINES_PER_LIFT = 10;
export const MAX_PLACE_NAME_LENGTH = 40;

export type MemorySet = { weight: number; reps: number };

export function seedSetRows(
  templateSets: MemorySet[],
  memorySets: MemorySet[] | null | undefined,
): MemorySet[] {
  if (!memorySets || memorySets.length === 0) return templateSets;
  return templateSets.map((preset, index) => {
    const mem = memorySets[index] ?? memorySets[memorySets.length - 1];
    return mem ?? preset;
  });
}

export function reseedIncompleteSets<
  T extends { completed: boolean; weight: number; reps: number },
>(sets: T[], memorySets: MemorySet[] | null | undefined): T[] {
  if (!memorySets || memorySets.length === 0) return sets;
  return sets.map((set, index) => {
    if (set.completed) return set;
    const mem = memorySets[index] ?? memorySets[memorySets.length - 1];
    if (!mem) return set;
    return { ...set, weight: mem.weight, reps: mem.reps };
  });
}

export function normalizePlaceName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Give this place a name");
  if (trimmed.length > MAX_PLACE_NAME_LENGTH) {
    throw new Error(`Name must be at most ${MAX_PLACE_NAME_LENGTH} characters`);
  }
  return trimmed;
}

export function placeNameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
