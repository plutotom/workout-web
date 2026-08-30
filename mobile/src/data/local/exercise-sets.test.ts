import { describe, expect, it } from "vitest";

import { setRowsForNewExercise } from "./exercise-sets";

describe("setRowsForNewExercise", () => {
  it("uses three seed rows when the picker adds a lift", () => {
    expect(setRowsForNewExercise(undefined, { weight: 135, reps: 5 })).toEqual([
      { weight: 135, reps: 5 },
      { weight: 135, reps: 5 },
      { weight: 135, reps: 5 },
    ]);
  });

  it("keeps AI set presets instead of the default three rows", () => {
    expect(
      setRowsForNewExercise(
        [
          { weight: 135, reps: 8 },
          { weight: 135, reps: 8 },
          { weight: 135, reps: 8 },
          { weight: 135, reps: 8 },
        ],
        { weight: 0, reps: 0 },
      ),
    ).toHaveLength(4);
  });

  it("caps oversized drafts at 20 sets", () => {
    const presets = Array.from({ length: 30 }, () => ({ weight: 0, reps: 10 }));
    expect(setRowsForNewExercise(presets, { weight: 0, reps: 0 })).toHaveLength(
      20,
    );
  });
});
