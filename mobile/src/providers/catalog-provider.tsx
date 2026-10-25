import { buildCatalog, type ExerciseCatalog } from "@shared/exercises";
import { createContext, useContext, useMemo } from "react";

import { useLocalCustomExercises } from "@/data/local/provider";
import { buildLocalExerciseCatalog } from "./local-exercise-catalog";

const CatalogContext = createContext<ExerciseCatalog>(buildCatalog());

/**
 * Custom lifts come from the on-device database rather than Convex so the
 * pickers work with no connection. Signing in refreshes that table through the
 * bootstrap payload, so the catalog stays correct in both modes.
 */
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const custom = useLocalCustomExercises();
  const catalog = useMemo(
    () => buildLocalExerciseCatalog(custom ?? []),
    [custom],
  );
  return (
    <CatalogContext.Provider value={catalog}>
      {children}
    </CatalogContext.Provider>
  );
}

export const useCatalog = () => useContext(CatalogContext);
