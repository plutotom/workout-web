import { describe, expect, it } from "vitest";

import {
  deleteExerciseConfirmMessage,
  prescriptionsForReplacedExercise,
  replacementHasLoggedSets,
} from "./replace-exercise";

describe("replacementHasLoggedSets", () => {
  it("is false when nothing is checked", () => {
    expect(
      replacementHasLoggedSets([{ completed: false }, { completed: false }]),
    ).toBe(false);
  });

  it("is true when any set is checked", () => {
    expect(
      replacementHasLoggedSets([{ completed: false }, { completed: true }]),
    ).toBe(true);
  });
});

describe("deleteExerciseConfirmMessage", () => {
  it("names the lift whose logged sets will be discarded", () => {
    expect(deleteExerciseConfirmMessage("Push Up")).toContain("Push Up");
    expect(deleteExerciseConfirmMessage("Push Up")).toContain("logged sets");
  });
});

describe("prescriptionsForReplacedExercise", () => {
  it("keeps the current set count and copies the new lift's load", () => {
    expect(
      prescriptionsForReplacedExercise(4, { weight: 185, reps: 5 }),
    ).toEqual([
      { weight: 185, reps: 5 },
      { weight: 185, reps: 5 },
      { weight: 185, reps: 5 },
      { weight: 185, reps: 5 },
    ]);
  });

  it("seeds bodyweight replacements at 0", () => {
    expect(
      prescriptionsForReplacedExercise(3, { weight: 0, reps: 12 }),
    ).toEqual([
      { weight: 0, reps: 12 },
      { weight: 0, reps: 12 },
      { weight: 0, reps: 12 },
    ]);
  });

  it("keeps at least one set and caps at 20", () => {
    expect(
      prescriptionsForReplacedExercise(0, { weight: 0, reps: 0 }),
    ).toHaveLength(1);
    expect(
      prescriptionsForReplacedExercise(40, { weight: 0, reps: 0 }),
    ).toHaveLength(20);
  });
});
