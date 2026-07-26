import { api } from "@backend/api";
import { buildCatalog, type ExerciseCatalog } from "@shared/exercises";
import { useQuery } from "convex/react";
import { createContext, useContext, useMemo } from "react";

const CatalogContext = createContext<ExerciseCatalog>(buildCatalog());

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const custom = useQuery(api.routes.exercises.queries.list);
  const catalog = useMemo(() => buildCatalog(custom ?? []), [custom]);
  return (
    <CatalogContext.Provider value={catalog}>
      {children}
    </CatalogContext.Provider>
  );
}

export const useCatalog = () => useContext(CatalogContext);
