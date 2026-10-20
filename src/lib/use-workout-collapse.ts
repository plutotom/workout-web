import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  expandSessionCollapsed,
  isWorkoutCollapseHydrated,
  pruneSessionCollapsed,
  readSessionCollapsed,
  subscribeWorkoutCollapse,
  toggleSessionCollapsed,
  type CollapsedMap,
} from "./workout-collapse";

export function useWorkoutCollapseHydrated(): boolean {
  return useSyncExternalStore(
    subscribeWorkoutCollapse,
    isWorkoutCollapseHydrated,
    isWorkoutCollapseHydrated,
  );
}

export function useWorkoutCollapse(
  sessionId: string,
  exerciseIds: readonly string[],
  ready = true,
): {
  collapsed: CollapsedMap;
  toggleCollapsed: (exerciseId: string) => void;
  expandCollapsed: (exerciseId: string) => void;
} {
  const liveKey = exerciseIds.join("\0");
  const collapsed = useSyncExternalStore(
    subscribeWorkoutCollapse,
    () => readSessionCollapsed(sessionId),
    () => readSessionCollapsed(sessionId),
  );

  useEffect(() => {
    // Wait until the session row is loaded. An empty first paint must not
    // look like "every exercise was deleted" and wipe stored folds.
    if (!ready) return;
    pruneSessionCollapsed(sessionId, liveKey === "" ? [] : liveKey.split("\0"));
  }, [sessionId, liveKey, ready]);

  const toggle = useCallback(
    (exerciseId: string) => {
      toggleSessionCollapsed(sessionId, exerciseId);
    },
    [sessionId],
  );

  const expand = useCallback(
    (exerciseId: string) => {
      expandSessionCollapsed(sessionId, exerciseId);
    },
    [sessionId],
  );

  return {
    collapsed,
    toggleCollapsed: toggle,
    expandCollapsed: expand,
  };
}
