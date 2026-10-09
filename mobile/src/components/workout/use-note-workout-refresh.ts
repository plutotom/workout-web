import { useEffect, useRef } from "react";

import { useLocalData } from "@/data/local/provider";
import type { RemoteCompletedNoteWorkout } from "@/data/local/repository";
import type { LocalWorkoutSession } from "@/data/local/types";

/** Refresh a viewed completed note, preserving any pending offline edit. */
export function useNoteWorkoutRefresh(
  local: LocalWorkoutSession | null | undefined,
  remote: RemoteCompletedNoteWorkout | null | undefined,
) {
  const { adoptRemoteNoteWorkout, revision } = useLocalData();
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (
      !local ||
      local.status !== "completed" ||
      local.inputMode !== "note" ||
      !remote ||
      remote.status !== "completed" ||
      remote.inputMode !== "note" ||
      (remote.clientUpdatedAt ?? 0) <= local.updatedAt
    )
      return;
    const version = `${local._id}:${remote._id}:${remote.clientUpdatedAt}:${revision}`;
    if (attempted.current === version) return;
    attempted.current = version;
    // A drained outbox advances revision, so retry a previously skipped remote
    // version. No-op adoption does not refresh and cannot trigger a loop.
    void adoptRemoteNoteWorkout(remote).catch(() => undefined);
  }, [local, remote, adoptRemoteNoteWorkout, revision]);
}
