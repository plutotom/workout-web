import { describe, expect, it } from "vitest";

import {
  resolvePushSessionTarget,
  resolveReceiptRemoteSessionId,
} from "./ios_session_sync";

const tracked = { _id: "tracked-1", sessionKind: "tracked" as const };
const summary = { _id: "summary-1", sessionKind: "health_summary" as const };
const otherTracked = { _id: "tracked-2", sessionKind: "tracked" as const };

describe("resolvePushSessionTarget", () => {
  it("inserts when the server has never seen the session", () => {
    expect(
      resolvePushSessionTarget({
        existingByClient: null,
        existingByExternal: null,
        incomingKind: "tracked",
      }),
    ).toEqual({ action: "insert" });
  });

  it("applies onto the device's own row", () => {
    expect(
      resolvePushSessionTarget({
        existingByClient: tracked,
        existingByExternal: null,
        incomingKind: "tracked",
      }),
    ).toEqual({
      action: "apply",
      targetId: "tracked-1",
      ignoreStale: false,
    });
  });

  it("applies a tracked snapshot onto a Health summary from another device", () => {
    expect(
      resolvePushSessionTarget({
        existingByClient: null,
        existingByExternal: summary,
        incomingKind: "tracked",
      }),
    ).toEqual({
      action: "apply",
      targetId: "summary-1",
      ignoreStale: true,
    });
  });

  it("does not replace a linked detailed workout with a Health summary", () => {
    expect(
      resolvePushSessionTarget({
        existingByClient: null,
        existingByExternal: tracked,
        incomingKind: "health_summary",
      }),
    ).toEqual({ action: "skip", targetId: "tracked-1" });
  });

  it("updates a Health summary in place when another device re-imports it", () => {
    expect(
      resolvePushSessionTarget({
        existingByClient: null,
        existingByExternal: summary,
        incomingKind: "health_summary",
      }),
    ).toEqual({
      action: "apply",
      targetId: "summary-1",
      ignoreStale: false,
    });
  });

  it("deletes a Health summary that duplicates the device's tracked session", () => {
    expect(
      resolvePushSessionTarget({
        existingByClient: tracked,
        existingByExternal: summary,
        incomingKind: "tracked",
      }),
    ).toEqual({
      action: "apply",
      targetId: "tracked-1",
      ignoreStale: false,
      deleteSessionId: "summary-1",
    });
  });

  it("unlinks another tracked session that already owns the Health UUID", () => {
    expect(
      resolvePushSessionTarget({
        existingByClient: tracked,
        existingByExternal: otherTracked,
        incomingKind: "tracked",
      }),
    ).toEqual({
      action: "apply",
      targetId: "tracked-1",
      ignoreStale: false,
      unlinkSessionId: "tracked-2",
    });
  });

  it("applies when both lookups are the same row", () => {
    expect(
      resolvePushSessionTarget({
        existingByClient: tracked,
        existingByExternal: tracked,
        incomingKind: "tracked",
      }),
    ).toEqual({
      action: "apply",
      targetId: "tracked-1",
      ignoreStale: false,
    });
  });
});

describe("resolveReceiptRemoteSessionId", () => {
  it("prefers the client-id row", () => {
    expect(
      resolveReceiptRemoteSessionId({
        existingByClient: tracked,
        existingByExternal: summary,
      }),
    ).toBe("tracked-1");
  });

  it("falls back to the Health UUID row after an external-only match", () => {
    expect(
      resolveReceiptRemoteSessionId({
        existingByClient: null,
        existingByExternal: summary,
      }),
    ).toBe("summary-1");
  });

  it("returns null when neither lookup hits", () => {
    expect(
      resolveReceiptRemoteSessionId({
        existingByClient: null,
        existingByExternal: null,
      }),
    ).toBeNull();
  });
});
