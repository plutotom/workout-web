import { useEffect, useRef } from "react";

import {
  sessionAllowsCompletedReviewEdit,
  shouldAdoptRemoteCompletedWorkout,
} from "@shared/session-edits";
import { useLocalData } from "@/data/local/provider";
import type {
  RemoteCompletedListWorkout,
  RemoteCompletedNoteWorkout,
} from "@/data/local/repository";
import type { LocalWorkoutSession } from "@/data/local/types";

/** Refresh a viewed completed workout, preserving any pending offline edit. */
export function useCompletedWorkoutRefresh(
  local: LocalWorkoutSession | null | undefined,
  remote:
    | RemoteCompletedNoteWorkout
    | RemoteCompletedListWorkout
    | null
    | undefined,
  opts?: { hydrateIfMissing?: boolean },
) {
  const { adoptRemoteCompletedWorkout, revision } = useLocalData();
  const attempted = useRef<string | null>(null);
  const hydrateIfMissing = opts?.hydrateIfMissing ?? false;

  useEffect(() => {
    if (!remote || remote.status !== "completed") return;

    if (!local) {
      if (!hydrateIfMissing || !sessionAllowsCompletedReviewEdit(remote))
        return;
      const version = `missing:${remote._id}:${remote.clientUpdatedAt}:${revision}`;
      if (attempted.current === version) return;
      attempted.current = version;
      void adoptRemoteCompletedWorkout(remote).catch(() => undefined);
      return;
    }

    if (
      local.status !== "completed" ||
      !shouldAdoptRemoteCompletedWorkout({
        pendingLocalWrite: false,
        localUpdatedAt: local.updatedAt,
        remoteClientUpdatedAt: remote.clientUpdatedAt,
      })
    )
      return;
    const version = `${local._id}:${remote._id}:${remote.clientUpdatedAt}:${revision}`;
    if (attempted.current === version) return;
    attempted.current = version;
    void adoptRemoteCompletedWorkout(remote).catch(() => undefined);
  }, [local, remote, adoptRemoteCompletedWorkout, revision, hydrateIfMissing]);
}
