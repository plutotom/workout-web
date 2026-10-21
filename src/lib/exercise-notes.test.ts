import { describe, expect, it } from "vitest";
import {
  EXERCISE_NOTE_INPUT_MAX_HEIGHT,
  exerciseNoteFieldMaxHeight,
  exerciseNoteFieldScrolls,
  exerciseNoteLengthHint,
  normalizeExerciseNote,
} from "./exercise-notes";

describe("exercise notes", () => {
  it.each([600, 5_000, 10_000])("preserves all %s characters", (length) => {
    const note = "x".repeat(length);
    expect(normalizeExerciseNote(note)).toBe(note);
  });
  it("rejects overflow instead of returning a shortened note", () => {
    expect(() => normalizeExerciseNote("x".repeat(10_001))).toThrow(
      "10000 characters",
    );
    expect(normalizeExerciseNote("  cue\n ")).toBe("cue");
    expect(normalizeExerciseNote(" \n ")).toBe("");
  });
  it.each([0, 600, 8_999])(
    "hides the counter for a %s-character note",
    (length) => {
      expect(exerciseNoteLengthHint("x".repeat(length))).toBeNull();
    },
  );
  it("shows a counter only near the limit and explains overflow without cutting text", () => {
    expect(exerciseNoteLengthHint("x".repeat(9_000))).toContain(
      "9,000 / 10,000",
    );
    expect(exerciseNoteLengthHint("x".repeat(10_000))).toContain(
      "10,000 / 10,000",
    );
    expect(exerciseNoteLengthHint("x".repeat(10_001))).toContain(
      "your text has not been cut",
    );
  });
});

describe("exercise note input sizing", () => {
  it("caps height only while focused", () => {
    expect(exerciseNoteFieldMaxHeight(false)).toBeUndefined();
    expect(exerciseNoteFieldMaxHeight(true)).toBe(
      EXERCISE_NOTE_INPUT_MAX_HEIGHT,
    );
  });

  it("scrolls inside only when a focused note overflows the cap", () => {
    expect(exerciseNoteFieldScrolls(false, 800)).toBe(false);
    expect(exerciseNoteFieldScrolls(true, 80)).toBe(false);
    expect(
      exerciseNoteFieldScrolls(true, EXERCISE_NOTE_INPUT_MAX_HEIGHT + 1),
    ).toBe(true);
  });
});
