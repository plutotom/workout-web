/**
 * Shared seeding rules for place/machine working weights.
 *
 * Template = structure (how many set rows). Memory = last numbers at this
 * equipment. Place-switch never adds or removes rows; it only overwrites
 * incomplete sets.
 */

export const DEFAULT_MACHINE_KEY = "default";
export const USUAL_MACHINE_NAME = "Usual";
export const HOME_PLACE_NAME = "Home";
export const MAX_PLACES = 20;
export const MAX_MACHINES_PER_LIFT = 10;
export const MAX_PLACE_NAME_LENGTH = 40;

export type MemorySet = { weight: number; reps: number };

/** Fill template rows from last time at this equipment; keep row count. */
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

/**
 * Overwrite weight/reps on incomplete rows only. Completed rows stay as typed.
 * No memory → leave the current numbers (caller may warn).
 */
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

/**
 * Untagged sessions (no placeId) count as Home. Used by recap so a Home PR
 * still sees history from before places existed.
 */
export function sessionMatchesPlace(
  session: { placeId?: string | null },
  placeId: string,
  homeId: string | null,
): boolean {
  const resolved = session.placeId ?? homeId;
  if (!resolved) return true;
  return resolved === placeId;
}
