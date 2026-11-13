import type { Exercise, MuscleGroup } from "@shared/exercises";
import { MUSCLE_GROUPS } from "@shared/exercises";

export function unusedExercises(
  exercises: readonly Exercise[],
  usedSlugs: readonly string[],
): Exercise[] {
  const used = new Set(usedSlugs);
  return exercises.filter((exercise) => !used.has(exercise.slug));
}

export function matchesQuery(exercise: Exercise, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    exercise.name.toLowerCase().includes(q) ||
    exercise.short.toLowerCase().includes(q)
  );
}

export function filterExercises(
  exercises: readonly Exercise[],
  query: string,
): Exercise[] {
  return exercises.filter((exercise) => matchesQuery(exercise, query));
}

export type UsageMaps = {
  lastUsedAt: ReadonlyMap<string, number>;
  sessionCount: ReadonlyMap<string, number>;
};

export function splitRecents(
  exercises: readonly Exercise[],
  usage: UsageMaps,
  recentLimit = 8,
  frequentLimit = 8,
): { recents: Exercise[]; frequent: Exercise[]; rest: Exercise[] } {
  const recents = [...exercises]
    .filter((exercise) => (usage.lastUsedAt.get(exercise.slug) ?? 0) > 0)
    .sort(
      (a, b) =>
        (usage.lastUsedAt.get(b.slug) ?? 0) -
        (usage.lastUsedAt.get(a.slug) ?? 0),
    )
    .slice(0, recentLimit);
  const recentSlugs = new Set(recents.map((exercise) => exercise.slug));
  const frequent = [...exercises]
    .filter(
      (exercise) =>
        (usage.sessionCount.get(exercise.slug) ?? 0) >= 2 &&
        !recentSlugs.has(exercise.slug),
    )
    .sort(
      (a, b) =>
        (usage.sessionCount.get(b.slug) ?? 0) -
        (usage.sessionCount.get(a.slug) ?? 0),
    )
    .slice(0, frequentLimit);
  const hide = new Set([
    ...recentSlugs,
    ...frequent.map((exercise) => exercise.slug),
  ]);
  const rest = exercises.filter((exercise) => !hide.has(exercise.slug));
  return { recents, frequent, rest };
}

export type MuscleSection = {
  title: string;
  id: MuscleGroup;
  data: Exercise[];
};

export function sectionsByMuscle(
  exercises: readonly Exercise[],
): MuscleSection[] {
  return MUSCLE_GROUPS.map((group) => ({
    title: group.label,
    id: group.id,
    data: exercises.filter((exercise) => exercise.category === group.id),
  })).filter((section) => section.data.length > 0);
}

export const MUSCLE_INDEX: { id: MuscleGroup; key: string }[] = [
  { id: "chest", key: "CH" },
  { id: "back", key: "BK" },
  { id: "legs", key: "LG" },
  { id: "shoulders", key: "SH" },
  { id: "arms", key: "AR" },
  { id: "core", key: "CO" },
];

export type EquipmentKind =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "band"
  | "kettlebell"
  | "other";

export const EQUIPMENT_GROUPS: { id: EquipmentKind; label: string }[] = [
  { id: "barbell", label: "Barbell" },
  { id: "dumbbell", label: "Dumbbell" },
  { id: "cable", label: "Cable" },
  { id: "machine", label: "Machine" },
  { id: "band", label: "Band" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "other", label: "Other" },
];

export function equipmentOf(exercise: Exercise): EquipmentKind {
  const name = exercise.name.toLowerCase();
  if (name.includes("kettlebell")) return "kettlebell";
  if (name.includes("band")) return "band";
  if (/\bcable\b/.test(name)) return "cable";
  if (
    name.includes("machine") ||
    name.includes("smith") ||
    name.includes("pec deck")
  ) {
    return "machine";
  }
  if (name.includes("dumbbell")) return "dumbbell";
  if (name.includes("barbell")) return "barbell";
  return "other";
}

export function sectionsByEquipment(
  exercises: readonly Exercise[],
): { title: string; id: EquipmentKind; data: Exercise[] }[] {
  return EQUIPMENT_GROUPS.map((group) => ({
    title: group.label,
    id: group.id,
    data: exercises.filter((exercise) => equipmentOf(exercise) === group.id),
  })).filter((section) => section.data.length > 0);
}

export function toggleSlug(
  current: string[],
  slug: string,
  mode: "add" | "replace",
): string[] {
  const active = current.includes(slug);
  if (mode === "replace") return active ? [] : [slug];
  return active ? current.filter((item) => item !== slug) : [...current, slug];
}

export function addLabel(mode: "add" | "replace", count: number): string {
  if (mode === "replace") return count ? "Replace" : "Select exercise";
  if (count === 0) return "Select exercises";
  return `Add ${count} exercise${count === 1 ? "" : "s"}`;
}

export function pickerTitle(mode: "add" | "replace"): string {
  return mode === "replace" ? "Replace exercise" : "Add exercises";
}
