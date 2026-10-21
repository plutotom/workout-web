import { describe, expect, it } from "vitest";

import {
  resolveShareSessionGate,
  SHARE_SYNC_FAILED_COPY,
  SHARE_SYNC_OFFLINE_COPY,
  SHARE_SYNC_PENDING_COPY,
} from "./share-session-gate";

const stuckOnline = {
  isAuthenticated: true,
  isWebSocketConnected: true,
  convexRemoteId: null,
  localCompleted: true,
  pendingAttemptCount: null,
} as const;

describe("resolveShareSessionGate", () => {
  it("unlocks as soon as Convex has the completed session", () => {
    expect(
      resolveShareSessionGate({
        ...stuckOnline,
        convexRemoteId: "remote_1",
      }),
    ).toEqual({ kind: "ready", remoteId: "remote_1" });
  });

  it("reproduces the stuck share screen: online, finished locally, nothing queued, Convex still null", () => {
    // Reopening used to show the same wait-forever copy. This is a failed
    // sync, not an offline wait — Health export is not part of the gate.
    expect(resolveShareSessionGate(stuckOnline)).toEqual({
      kind: "failed",
      canRetry: true,
    });
    expect(SHARE_SYNC_FAILED_COPY).not.toMatch(/reopen/i);
    expect(SHARE_SYNC_OFFLINE_COPY).not.toMatch(/reopen/i);
    expect(SHARE_SYNC_PENDING_COPY).toMatch(/syncing/i);
  });

  it("waits live while the completed snapshot is queued", () => {
    expect(
      resolveShareSessionGate({
        ...stuckOnline,
        pendingAttemptCount: 0,
      }),
    ).toEqual({ kind: "syncing" });
  });

  it("keeps a clear offline message and surfaces a retry after a failed attempt", () => {
    expect(
      resolveShareSessionGate({
        ...stuckOnline,
        isWebSocketConnected: false,
        pendingAttemptCount: 0,
      }),
    ).toEqual({ kind: "offline" });
    expect(
      resolveShareSessionGate({
        ...stuckOnline,
        pendingAttemptCount: 2,
      }),
    ).toEqual({ kind: "failed", canRetry: true });
  });

  it.each([undefined, null, 0])(
    "shows offline on a cold visit before Convex resolves (outbox: %s)",
    (pendingAttemptCount) => {
      expect(
        resolveShareSessionGate({
          ...stuckOnline,
          isWebSocketConnected: false,
          convexRemoteId: undefined,
          pendingAttemptCount,
        }),
      ).toEqual({ kind: "offline" });
    },
  );

  it("loads after reconnecting, then follows the live sync state", () => {
    expect(
      resolveShareSessionGate({ ...stuckOnline, convexRemoteId: undefined }),
    ).toEqual({ kind: "loading" });
  });

  it.each([undefined, 0])(
    "offers retry after a bounded online wait (outbox: %s)",
    (pendingAttemptCount) => {
      expect(
        resolveShareSessionGate({
          ...stuckOnline,
          pendingAttemptCount,
          waitExpired: true,
        }),
      ).toEqual({ kind: "failed", canRetry: true });
      expect(
        resolveShareSessionGate({
          ...stuckOnline,
          convexRemoteId: "remote_1",
          pendingAttemptCount,
          waitExpired: true,
        }),
      ).toEqual({ kind: "ready", remoteId: "remote_1" });
    },
  );

  it("does not offer retry for a workout that is not on this phone", () => {
    expect(
      resolveShareSessionGate({
        ...stuckOnline,
        localCompleted: false,
      }),
    ).toEqual({ kind: "failed", canRetry: false });
  });
});
