import { useEffect, useRef } from "react";
import { AppState } from "react-native";
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
  listWatchClosures,
  acknowledgeWatchClosure,
  recoverFinishedWatchClosure,
} from "@/data/local/repository";
import {
  accountDatabaseName,
  trackLocalWrite,
  transferredGuestWorkoutIds,
} from "@/data/local/storage-scopes";
import type { WatchEvent } from "./watch-session";
import {
  subscribeWatchEvents,
  setWatchAccountScope,
  closeWatchRecording,
} from "@/health/watch-bridge";

/**
 * Persists Watch recording + the Health UUID so phone export does not write a
 * second workout. Attach is best-effort until the session is completed.
 */
export function WatchHealthCoordinator() {
  const db = useSQLiteContext();
  const { owner, refresh, revision } = useLocalData();
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const handleEvent = (event: WatchEvent) => {
      if (event.type === "metrics" || !event.sessionId) return;
      const previous = writes.current;
      writes.current = trackLocalWrite(accountDatabaseName(owner), async () => {
        await previous.catch(() => undefined);
        // Native replay survives sign-out. Only the owning account may adopt it.
        const workout = await getLocalWorkout(db, event.sessionId);
        if (!workout) return;
        if (
          event.type === "state" &&
          workout.status !== "in_progress" &&
          [
            "starting",
            "recording",
            "recovering",
            "recoveryFailed",
            "saving",
            "saveFailed",
          ].includes(event.status)
        ) {
          const closure = await recoverFinishedWatchClosure(
            db,
            event.sessionId,
          );
          if (closure) {
            await closeWatchRecording(
              closure.sessionId,
              closure.endedAt,
              closure.discard,
              owner,
            );
            await acknowledgeWatchClosure(
              db,
              closure.sessionId,
              closure.endedAt,
              closure.discard,
            );
          }
        }
        if (
          event.type === "state" &&
          ["starting", "recovering", "recoveryFailed"].includes(event.status)
        ) {
          if (!(await wasWatchRecorded(db, event.sessionId)))
            await setWatchStartPending(db, event.sessionId, true);
          return;
        }
        if (
          event.type === "state" &&
          ["recording", "saving", "saveFailed"].includes(event.status)
        ) {
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
        if (event.healthSaved) await markWatchRecorded(db, event.sessionId);
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
    };
    void transferredGuestWorkoutIds(db, owner)
      .then((ids) => {
        if (!active) return;
        setWatchAccountScope(owner, ids);
        unsubscribe = subscribeWatchEvents(handleEvent);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [db, owner, refresh]);

  useEffect(() => {
    let active = true;
    const drain = () => {
      const previous = writes.current;
      writes.current = trackLocalWrite(accountDatabaseName(owner), async () => {
        await previous.catch(() => undefined);
        for (const closure of await listWatchClosures(db)) {
          if (!active) return;
          await closeWatchRecording(
            closure.sessionId,
            closure.endedAt,
            closure.discard,
            owner,
          );
          await acknowledgeWatchClosure(
            db,
            closure.sessionId,
            closure.endedAt,
            closure.discard,
          );
        }
      }).catch(() => undefined);
    };
    drain();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") drain();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [db, owner, revision]);

  return null;
}
