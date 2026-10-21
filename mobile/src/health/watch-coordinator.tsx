import { useEffect, useRef } from "react";
import { useSQLiteContext } from "expo-sqlite";

import { useLocalData } from "@/data/local/provider";
import {
  attachStoredWatchHealthUuid,
  getLocalWorkout,
  isWatchStartPending,
  markWatchRecorded,
  wasWatchRecorded,
  saveWatchHealthUuid,
  setWatchStartPending,
  queueHealthExportIfEnabled,
} from "@/data/local/repository";
import {
  accountDatabaseName,
  trackLocalWrite,
} from "@/data/local/storage-scopes";
import { subscribeWatchEvents } from "@/health/watch-bridge";

/**
 * Persists Watch recording + the Health UUID so phone export does not write a
 * second workout. Attach is best-effort until the session is completed.
 */
export function WatchHealthCoordinator() {
  const db = useSQLiteContext();
  const { owner, refresh } = useLocalData();
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    return subscribeWatchEvents((event) => {
      if (event.type === "metrics" || !event.sessionId) return;
      const previous = writes.current;
      writes.current = trackLocalWrite(accountDatabaseName(owner), async () => {
        await previous.catch(() => undefined);
        // Native replay survives sign-out. Only the owning account may adopt it.
        const workout = await getLocalWorkout(db, event.sessionId);
        if (!workout) return;
        if (event.type === "state" && event.status === "starting") {
          if (!(await wasWatchRecorded(db, event.sessionId)))
            await setWatchStartPending(db, event.sessionId, true);
          return;
        }
        if (event.type === "state" && event.status === "recording") {
          if (!(await wasWatchRecorded(db, event.sessionId)))
            await markWatchRecorded(db, event.sessionId);
          return;
        }
        if (
          event.type === "state" &&
          event.status === "idle" &&
          (await isWatchStartPending(db, event.sessionId))
        ) {
          await setWatchStartPending(db, event.sessionId, false);
          await queueHealthExportIfEnabled(db, event.sessionId);
          refresh();
          return;
        }
        if (event.type !== "ended" || !event.sessionId) return;
        await setWatchStartPending(db, event.sessionId, false);
        if (event.healthUuid) {
          if (workout.health?.externalId === event.healthUuid) return;
          await saveWatchHealthUuid(db, event.sessionId, event.healthUuid);
          try {
            await attachStoredWatchHealthUuid(db, event.sessionId);
            refresh();
          } catch {
            // Still in progress — finish() attaches the stored UUID.
          }
        } else {
          await queueHealthExportIfEnabled(db, event.sessionId);
          refresh();
        }
      }).catch(() => undefined);
    });
  }, [db, owner, refresh]);

  return null;
}
