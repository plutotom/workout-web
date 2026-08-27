import { useEffect } from "react";
import { useSQLiteContext } from "expo-sqlite";

import { useLocalData } from "@/data/local/provider";
import {
  attachExportedHealthUuid,
  markWatchRecorded,
  saveWatchHealthUuid,
} from "@/data/local/repository";
import { subscribeWatchEvents } from "@/health/watch-bridge";

/**
 * Persists Watch recording + the Health UUID so phone export does not write a
 * second workout. Attach is best-effort until the session is completed.
 */
export function WatchHealthCoordinator() {
  const db = useSQLiteContext();
  const { refresh } = useLocalData();

  useEffect(() => {
    return subscribeWatchEvents((event) => {
      void (async () => {
        if (
          event.type === "state" &&
          event.sessionId &&
          (event.status === "starting" || event.status === "recording")
        ) {
          await markWatchRecorded(db, event.sessionId);
          return;
        }
        if (event.type !== "ended" || !event.sessionId) return;
        if (event.healthUuid) {
          await saveWatchHealthUuid(db, event.sessionId, event.healthUuid);
          try {
            await attachExportedHealthUuid(
              db,
              event.sessionId,
              event.healthUuid,
            );
            refresh();
          } catch {
            // Still in progress — finish() attaches the stored UUID.
          }
        }
      })();
    });
  }, [db, refresh]);

  return null;
}
