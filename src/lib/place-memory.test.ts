import { describe, expect, it } from "vitest";

import {
  normalizePlaceName,
  reseedIncompleteSets,
  seedSetRows,
  sessionMatchesPlace,
} from "./place-memory";

describe("seedSetRows", () => {
  it("keeps template rows when there is no memory", () => {
    const template = [
      { weight: 400, reps: 8 },
      { weight: 400, reps: 8 },
      { weight: 400, reps: 8 },
    ];
    expect(seedSetRows(template, null)).toEqual(template);
    expect(seedSetRows(template, [])).toEqual(template);
  });

  it("fills template rows from memory without changing set count", () => {
    expect(
      seedSetRows(
        [
          { weight: 400, reps: 8 },
          { weight: 400, reps: 8 },
          { weight: 400, reps: 8 },
          { weight: 400, reps: 8 },
        ],
        [
          { weight: 300, reps: 10 },
          { weight: 300, reps: 8 },
        ],
      ),
    ).toEqual([
      { weight: 300, reps: 10 },
      { weight: 300, reps: 8 },
      { weight: 300, reps: 8 },
      { weight: 300, reps: 8 },
    ]);
  });
});

describe("reseedIncompleteSets", () => {
  it("leaves completed sets and rewrites the rest", () => {
    const sets = [
      { completed: true, weight: 400, reps: 8 },
      { completed: false, weight: 400, reps: 8 },
      { completed: false, weight: 400, reps: 8 },
    ];
    expect(
      reseedIncompleteSets(sets, [
        { weight: 300, reps: 10 },
        { weight: 300, reps: 8 },
        { weight: 275, reps: 8 },
      ]),
    ).toEqual([
      { completed: true, weight: 400, reps: 8 },
      { completed: false, weight: 300, reps: 8 },
      { completed: false, weight: 275, reps: 8 },
    ]);
  });

  it("does not add or remove rows", () => {
    const sets = [
      { completed: false, weight: 400, reps: 8 },
      { completed: false, weight: 400, reps: 8 },
    ];
    const next = reseedIncompleteSets(sets, [
      { weight: 300, reps: 8 },
      { weight: 300, reps: 8 },
      { weight: 300, reps: 8 },
    ]);
    expect(next).toHaveLength(2);
  });

  it("keeps current numbers when the new place has no memory", () => {
    const sets = [{ completed: false, weight: 400, reps: 8 }];
    expect(reseedIncompleteSets(sets, null)).toEqual(sets);
  });
});

describe("normalizePlaceName", () => {
  it("trims and rejects empty names", () => {
    expect(normalizePlaceName("  Elgin  ")).toBe("Elgin");
    expect(() => normalizePlaceName("   ")).toThrow(/name/i);
  });
});

describe("sessionMatchesPlace", () => {
  it("treats untagged sessions as Home", () => {
    expect(sessionMatchesPlace({ placeId: null }, "home", "home")).toBe(true);
    expect(sessionMatchesPlace({}, "home", "home")).toBe(true);
  });

  it("does not count Home history toward a guest place", () => {
    expect(sessionMatchesPlace({ placeId: null }, "elgin", "home")).toBe(false);
    expect(sessionMatchesPlace({ placeId: "home" }, "elgin", "home")).toBe(
      false,
    );
  });
});
