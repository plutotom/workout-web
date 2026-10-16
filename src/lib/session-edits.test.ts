import { describe, expect, it } from "vitest";

import {
  nextClientUpdatedAt,
  sessionAllowsCompletedReviewEdit,
  sessionAllowsLiftEdits,
  shouldAdoptRemoteCompletedWorkout,
} from "./session-edits";

describe("sessionAllowsLiftEdits", () => {
  it("allows in-progress and completed tracked list workouts", () => {
    expect(sessionAllowsLiftEdits({ status: "in_progress" })).toBe(true);
    expect(
      sessionAllowsLiftEdits({
        status: "completed",
        sessionKind: "tracked",
        inputMode: "list",
      }),
    ).toBe(true);
  });

  it("rejects abandoned, health summaries, and note-mode sessions", () => {
    expect(sessionAllowsLiftEdits({ status: "abandoned" })).toBe(false);
    expect(
      sessionAllowsLiftEdits({
        status: "completed",
        sessionKind: "health_summary",
      }),
    ).toBe(false);
    expect(
      sessionAllowsLiftEdits({
        status: "completed",
        inputMode: "note",
      }),
    ).toBe(false);
  });
});

describe("sessionAllowsCompletedReviewEdit", () => {
  it("is only the finished-list case, not the live session", () => {
    expect(sessionAllowsCompletedReviewEdit({ status: "in_progress" })).toBe(
      false,
    );
    expect(
      sessionAllowsCompletedReviewEdit({
        status: "completed",
        sessionKind: "tracked",
      }),
    ).toBe(true);
  });
});

describe("nextClientUpdatedAt", () => {
  it("advances past both wall clock and the previous revision", () => {
    expect(nextClientUpdatedAt(50, 10)).toBe(51);
    expect(nextClientUpdatedAt(undefined, 10)).toBe(10);
    expect(nextClientUpdatedAt(10, 50)).toBe(50);
  });
});

describe("shouldAdoptRemoteCompletedWorkout", () => {
  it("keeps a queued offline edit instead of a stale cloud snapshot", () => {
    expect(
      shouldAdoptRemoteCompletedWorkout({
        pendingLocalWrite: true,
        localUpdatedAt: 10,
        remoteClientUpdatedAt: 99,
      }),
    ).toBe(false);
  });

  it("adopts a strictly newer cloud revision and ignores equal or older ones", () => {
    expect(
      shouldAdoptRemoteCompletedWorkout({
        pendingLocalWrite: false,
        localUpdatedAt: 10,
        remoteClientUpdatedAt: 11,
      }),
    ).toBe(true);
    expect(
      shouldAdoptRemoteCompletedWorkout({
        pendingLocalWrite: false,
        localUpdatedAt: 10,
        remoteClientUpdatedAt: 10,
      }),
    ).toBe(false);
    expect(
      shouldAdoptRemoteCompletedWorkout({
        pendingLocalWrite: false,
        localUpdatedAt: 10,
        remoteClientUpdatedAt: null,
      }),
    ).toBe(false);
  });
});
