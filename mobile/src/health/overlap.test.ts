import { describe, expect, it } from "vitest";

import { findLikelyHealthOverlap, isLikelyHealthOverlap } from "./overlap";

const morning = {
  startedAt: Date.parse("2026-08-22T08:00:00"),
  completedAt: Date.parse("2026-08-22T09:00:00"),
};

describe("isLikelyHealthOverlap", () => {
  it("matches start times within 10 minutes on the same day", () => {
    expect(
      isLikelyHealthOverlap(morning, {
        startedAt: Date.parse("2026-08-22T08:08:00"),
        completedAt: Date.parse("2026-08-22T08:40:00"),
      }),
    ).toBe(true);
  });

  it("matches when overlap covers half of the shorter session", () => {
    expect(
      isLikelyHealthOverlap(morning, {
        startedAt: Date.parse("2026-08-22T08:20:00"),
        completedAt: Date.parse("2026-08-22T08:50:00"),
      }),
    ).toBe(true);
  });

  it("does not match a later activity on the same day", () => {
    expect(
      isLikelyHealthOverlap(morning, {
        startedAt: Date.parse("2026-08-22T18:00:00"),
        completedAt: Date.parse("2026-08-22T18:40:00"),
      }),
    ).toBe(false);
  });

  it("does not match the next calendar day", () => {
    expect(
      isLikelyHealthOverlap(morning, {
        startedAt: Date.parse("2026-08-23T08:00:00"),
        completedAt: Date.parse("2026-08-23T09:00:00"),
      }),
    ).toBe(false);
  });
});

describe("findLikelyHealthOverlap", () => {
  it("returns the first overlapping detailed session", () => {
    const match = findLikelyHealthOverlap(morning, [
      {
        sessionId: "later",
        startedAt: Date.parse("2026-08-22T18:00:00"),
        completedAt: Date.parse("2026-08-22T18:40:00"),
      },
      {
        sessionId: "same",
        startedAt: Date.parse("2026-08-22T08:02:00"),
        completedAt: Date.parse("2026-08-22T09:10:00"),
      },
    ]);
    expect(match?.sessionId).toBe("same");
  });
});
