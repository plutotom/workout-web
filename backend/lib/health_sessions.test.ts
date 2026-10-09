import { describe, expect, it } from "vitest";

import {
  normalizeSessionKind,
  sessionCountsTowardGoals,
} from "./health_sessions";

describe("normalizeSessionKind", () => {
  it("treats missing or unknown kinds as tracked lifting sessions", () => {
    expect(normalizeSessionKind(undefined)).toBe("tracked");
    expect(normalizeSessionKind("tracked")).toBe("tracked");
    expect(normalizeSessionKind("health_summary")).toBe("health_summary");
  });
});

describe("sessionCountsTowardGoals", () => {
  it("counts nonblank note text once without exercise or weight data", () => {
    expect(
      sessionCountsTowardGoals({
        sessionKind: "tracked",
        inputMode: "note",
        noteBody: "Pull up, 10, 9, 9",
        hasLoggedWork: false,
      }),
    ).toBe(true);
    expect(
      sessionCountsTowardGoals({
        sessionKind: "tracked",
        inputMode: "note",
        noteBody: "edited note",
        hasLoggedWork: true,
      }),
    ).toBe(true);
  });

  it.each([undefined, null, "", " \n\t"])(
    "does not count empty note %s",
    (noteBody) => {
      expect(
        sessionCountsTowardGoals({
          inputMode: "note",
          noteBody,
          hasLoggedWork: false,
        }),
      ).toBe(false);
    },
  );

  it("keeps list text and excluded Health summaries from granting attendance", () => {
    expect(
      sessionCountsTowardGoals({
        inputMode: "list",
        noteBody: "text",
        hasLoggedWork: false,
      }),
    ).toBe(false);
    expect(
      sessionCountsTowardGoals({
        sessionKind: "health_summary",
        countsTowardGoals: false,
        inputMode: "note",
        noteBody: "text",
        hasLoggedWork: false,
      }),
    ).toBe(false);
  });
  it("counts a detailed app workout with logged sets", () => {
    expect(
      sessionCountsTowardGoals({
        sessionKind: "tracked",
        countsTowardGoals: true,
        hasLoggedWork: true,
      }),
    ).toBe(true);
  });

  it("does not count an abandoned or empty tracked workout", () => {
    expect(
      sessionCountsTowardGoals({
        sessionKind: "tracked",
        hasLoggedWork: false,
      }),
    ).toBe(false);
  });

  it("counts a manually imported Health summary", () => {
    expect(
      sessionCountsTowardGoals({
        sessionKind: "health_summary",
        countsTowardGoals: true,
        hasLoggedWork: false,
      }),
    ).toBe(true);
  });

  it("excludes a Health summary that does not count toward goals", () => {
    expect(
      sessionCountsTowardGoals({
        sessionKind: "health_summary",
        countsTowardGoals: false,
        hasLoggedWork: false,
      }),
    ).toBe(false);
  });
});
