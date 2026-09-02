import type { Id } from "@backend/dataModel";

import {
  MUSCLE_GROUPS,
  type Exercise,
  type MuscleGroup,
} from "@/lib/exercises";

export type ExerciseSort = "az" | "recent" | "custom";

export const EXERCISE_SORTS: { id: ExerciseSort; label: string }[] = [
  { id: "az", label: "A–Z" },
  { id: "recent", label: "Recently used" },
  { id: "custom", label: "Custom first" },
];

export function muscleGroupLabel(id: MuscleGroup): string {
  return MUSCLE_GROUPS.find((g) => g.id === id)?.label ?? id;
}

/** A custom-exercise slug looks like `custom:<id>`; null for curated lifts. */
export function customExerciseId(slug: string): Id<"customExercises"> | null {
  if (!slug.startsWith("custom:")) return null;
  const id = slug.slice("custom:".length);
  return id.length > 0 ? (id as Id<"customExercises">) : null;
}

export function exerciseDetailPath(
  slug: string,
  query?: { days?: string; from?: string },
): string {
  const params = new URLSearchParams();
  if (query?.days) params.set("days", query.days);
  if (query?.from) params.set("from", query.from);
  const q = params.toString();
  return `/exercises/${encodeURIComponent(slug)}${q ? `?${q}` : ""}`;
}

export function browseExercises(
  live: readonly Exercise[],
  archived: readonly Exercise[],
  opts: {
    query: string;
    group: MuscleGroup | "all";
    sort: ExerciseSort;
    lastUsedAt: ReadonlyMap<string, number>;
    includeArchived: boolean;
    customOnly: boolean;
  },
): Exercise[] {
  const q = opts.query.trim().toLowerCase();
  const pool = opts.includeArchived ? [...live, ...archived] : [...live];

  const filtered = pool.filter((e) => {
    if (opts.customOnly && !e.custom) return false;
    if (opts.group !== "all" && e.category !== opts.group) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) || e.short.toLowerCase().includes(q)
    );
  });

  filtered.sort((a, b) => {
    if (opts.sort === "recent") {
      const aT = opts.lastUsedAt.get(a.slug) ?? 0;
      const bT = opts.lastUsedAt.get(b.slug) ?? 0;
      if (aT !== bT) return bT - aT;
      return a.name.localeCompare(b.name);
    }
    if (opts.sort === "custom") {
      if (!!a.custom !== !!b.custom) return a.custom ? -1 : 1;
      return a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });

  return filtered;
}
