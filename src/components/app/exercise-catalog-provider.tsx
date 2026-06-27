"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";

import { api } from "@backend/api";
import {
  buildCatalog,
  type CustomExerciseEntry,
  type ExerciseCatalog,
} from "@/lib/exercises";

const ExerciseCatalogContext = createContext<ExerciseCatalog | null>(null);

/**
 * Provides the merged exercise catalog (curated lifts + the signed-in user's
 * custom lifts) to the app. Custom lifts are private to their owner — the query
 * is user-scoped on the backend.
 */
export function ExerciseCatalogProvider({ children }: { children: ReactNode }) {
  const customs = useQuery(api.routes.exercises.queries.list);

  const catalog = useMemo(
    () => buildCatalog((customs ?? []) as CustomExerciseEntry[]),
    [customs],
  );

  return (
    <ExerciseCatalogContext.Provider value={catalog}>
      {children}
    </ExerciseCatalogContext.Provider>
  );
}

export function useExerciseCatalog(): ExerciseCatalog {
  const catalog = useContext(ExerciseCatalogContext);
  if (!catalog)
    throw new Error(
      "useExerciseCatalog must be used within an ExerciseCatalogProvider",
    );
  return catalog;
}
