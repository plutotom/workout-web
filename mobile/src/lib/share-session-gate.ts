/**
 * Share needs a completed Convex session. Local `remote_id` is not enough —
 * an in-progress upload writes that id before Finish, and a stale ack can
 * leave the server row unfinished while the outbox is empty.
 */
export const SHARE_SYNC_OFFLINE_COPY =
  "Waiting for this workout to sync. Stay on this screen — it will update when you’re back online.";
export const SHARE_SYNC_PENDING_COPY = "Syncing this workout…";
export const SHARE_SYNC_FAILED_COPY =
  "Couldn’t sync this workout. Check your connection and try again.";

export type ShareSessionGate =
  | { kind: "signed_out" }
  | { kind: "loading" }
  | { kind: "ready"; remoteId: string }
  | { kind: "offline" }
  | { kind: "syncing" }
  | { kind: "failed"; canRetry: boolean };

export function resolveShareSessionGate(input: {
  isAuthenticated: boolean;
  isWebSocketConnected: boolean;
  /** `undefined` while the live query is loading. */
  convexRemoteId: string | null | undefined;
  localCompleted: boolean;
  /** `undefined` while SQLite is loading; `null` if this session is not queued. */
  pendingAttemptCount: number | null | undefined;
}): ShareSessionGate {
  if (!input.isAuthenticated) return { kind: "signed_out" };
  if (typeof input.convexRemoteId === "string") {
    return { kind: "ready", remoteId: input.convexRemoteId };
  }
  if (
    input.convexRemoteId === undefined ||
    input.pendingAttemptCount === undefined
  ) {
    return { kind: "loading" };
  }
  if (!input.isWebSocketConnected) return { kind: "offline" };
  if (input.pendingAttemptCount === null) {
    return { kind: "failed", canRetry: input.localCompleted };
  }
  if (input.pendingAttemptCount > 0) return { kind: "failed", canRetry: true };
  return { kind: "syncing" };
}
