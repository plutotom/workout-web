import { buildCatalog, type ExerciseCatalog } from "@shared/exercises";

import { localCustomSlug, type LocalCustomExercise } from "@/data/local/types";

/** Open editors can still hold a lift's provisional slug after sync adopts it. */
export function buildLocalExerciseCatalog(
  custom: readonly LocalCustomExercise[],
): ExerciseCatalog {
  const catalog = buildCatalog(
    custom.map((exercise) => ({
      ...exercise,
      short: exercise.short ?? undefined,
    })),
  );
  const aliases = new Map(
    custom.map((exercise) => [localCustomSlug(exercise._id), exercise.slug]),
  );
  const resolve = (slug: string) =>
    catalog.get(slug) ? slug : (aliases.get(slug) ?? slug);
  return {
    ...catalog,
    name: (slug) => catalog.name(resolve(slug)),
    short: (slug) => catalog.short(resolve(slug)),
    category: (slug) => catalog.category(resolve(slug)),
    usesBar: (slug) => catalog.usesBar(resolve(slug)),
    get: (slug) => catalog.get(resolve(slug)),
  };
}
