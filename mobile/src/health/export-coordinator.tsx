import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import { useLocalData } from "@/data/local/provider";
import {
  attachExportedHealthUuid,
  getHealthExportEnabled,
  listPendingHealthExports,
} from "@/data/local/repository";
import { getHealthAdapter } from "@/health";

/**
 * Saves finished in-app workouts to Apple Health when export is enabled.
 * Failures stay local and retry on the next revision or foreground.
 */
export function HealthExportCoordinator() {
  const db = useSQLiteContext();
  const { revision, refresh } = useLocalData();
  const draining = useRef(false);
  const rerun = useRef(false);

  const drain = useCallback(async () => {
    if (draining.current) {
      rerun.current = true;
      return;
    }
    draining.current = true;
    try {
      do {
        rerun.current = false;
        if (!(await getHealthExportEnabled(db))) return;
        const adapter = getHealthAdapter();
        if (!(await adapter.isAvailable())) return;
        const pending = await listPendingHealthExports(db);
        if (pending.length === 0) return;
        let attached = false;
        for (const item of pending) {
          try {
            const { uuid } = await adapter.saveTrackedWorkout({
              sessionId: item.sessionId,
              startedAt: item.startedAt,
              endedAt: item.endedAt,
            });
            await attachExportedHealthUuid(db, item.sessionId, uuid);
            attached = true;
          } catch {
            // Leave pending. The next foreground or finish retries.
          }
        }
        if (attached) refresh();
      } while (rerun.current);
    } finally {
      draining.current = false;
    }
  }, [db, refresh]);

  useEffect(() => {
    void drain();
  }, [drain, revision]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void drain();
    });
    return () => sub.remove();
  }, [drain]);

  return null;
}
