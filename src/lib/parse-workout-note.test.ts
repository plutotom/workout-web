import { describe, expect, it } from "vitest";

import examples from "./fixtures/note-workouts/user-examples.json";
import { EXERCISES } from "./exercises";
import { workoutNoteCatalog } from "./note-conversion-preview";
import {
  parseWorkoutNote,
  type NoteParserExercise,
} from "./parse-workout-note";

const catalog: NoteParserExercise[] = workoutNoteCatalog(EXERCISES);
const parse = (text: string) =>
  parseWorkoutNote(text, { noteUnit: "lb", catalog });
const numbers = (sets: ReturnType<typeof parse>["exercises"][number]["sets"]) =>
  sets.map(({ reps, weight, failedAttempt }) => ({
    reps,
    weight,
    failedAttempt,
  }));

describe("workout note review parser", () => {
  it("parses the user's multiline note including per-dumbbell and per-side notation", () => {
    const original = examples[0].noteBody;
    const result = parse(original);
    expect(result.originalText).toBe(original);
    expect(result.exercises.map((exercise) => exercise.name)).toEqual([
      "Strict press",
      "Deadlift",
      "Normal gym",
      "Back squat",
    ]);
    const [press, deadlift, gym, squat] = result.exercises;
    expect(press.slug).toBe("overhead-press-dumbbell");
    expect(numbers(press.sets)).toEqual([
      { reps: 6, weight: 10, failedAttempt: false },
      { reps: 4, weight: 20, failedAttempt: false },
      { reps: 2, weight: 25, failedAttempt: false },
      { reps: 4, weight: 25, failedAttempt: true },
      { reps: 2, weight: 25, failedAttempt: true },
    ]);
    expect(deadlift.slug).toBe("deadlift");
    expect(deadlift.sets.map((set) => [set.reps, set.weight])).toEqual([
      [6, 180],
      [4, 200],
      [2, 225],
      [6, 200],
      [4, 225],
      [2, 235],
    ]);
    expect(gym.slug).toBeNull();
    expect(gym.sets.map((set) => [set.reps, set.weight])).toEqual([
      [10, 50],
      [8, 55],
    ]);
    expect(squat.slug).toBe("squat");
    expect(squat.sets.map((set) => [set.reps, set.weight])).toEqual([
      [5, 155],
      [4, 175],
      [3, 185],
      [5, 175],
      [4, 185],
      [3, 195],
    ]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "unknown-exercise",
    ]);
  });

  it("reads the three alternate press formats as the same five sets", () => {
    const results = examples.slice(1).map((example) => parse(example.noteBody));
    expect(numbers(results[0].exercises[0].sets)).toEqual(
      numbers(results[1].exercises[0].sets),
    );
    expect(numbers(results[0].exercises[0].sets)).toEqual(
      numbers(results[2].exercises[0].sets),
    );
    for (const result of results) {
      expect(result.exercises[0].slug).toBeNull();
      expect(result.exercises[0].candidates).toEqual(
        expect.arrayContaining(["ohp", "overhead-press-dumbbell"]),
      );
      expect(
        result.issues.some((issue) => issue.code === "ambiguous-exercise"),
      ).toBe(true);
    }
  });

  it("preserves failure annotations and successful reps without creating failed sets", () => {
    const result = parse("Deadlift: 4@225F, 2@225 fail");
    expect(numbers(result.exercises[0].sets)).toEqual([
      { reps: 4, weight: 225, failedAttempt: true },
      { reps: 2, weight: 225, failedAttempt: true },
    ]);
    expect(result.issues).toEqual([]);
  });

  it("uses the saved note unit and retains explicit units without account reinterpretation", () => {
    const result = parseWorkoutNote("Deadlift: 6@100, 4@120kg, 2@225lbs", {
      noteUnit: "kg",
      catalog,
    });
    expect(result.noteUnit).toBe("kg");
    expect(
      result.exercises[0].sets.map((set) => [set.weight, set.unit]),
    ).toEqual([
      [100, "kg"],
      [120, "kg"],
      [225, "lb"],
    ]);
  });

  it("uses a configured bar weight for plate sums", () => {
    const result = parseWorkoutNote("Back squat: 5@20+5", {
      noteUnit: "kg",
      catalog,
      barWeight: 20,
    });
    expect(result.exercises[0].sets[0].weight).toBe(70);
    expect(result.issues).toEqual([]);
  });

  it("does not invent a kg bar weight or mix the bar's unit with an explicit plate unit", () => {
    for (const result of [
      parseWorkoutNote("Back squat: 5@20+5", { noteUnit: "kg", catalog }),
      parse("Back squat: 5@20+5kg"),
    ]) {
      expect(result.exercises[0].sets[0].weight).toBeNull();
      expect(result.issues.map((issue) => issue.code)).toEqual([
        "missing-bar-weight",
      ]);
    }
  });

  it("preserves fractional weights for review rather than rounding recorded work", () => {
    const result = parse("Deadlift: 6@12.5");
    expect(result.exercises[0].sets[0].weight).toBe(12.5);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "unsupported-precision",
    ]);
  });

  it("preserves unmatched source lines and flags sets without an exercise", () => {
    const result = parse("6@180\nDeadlift\n- 4@200\n225 ??\n—-\n2@235");
    expect(result.originalText).toContain("225 ??");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-set",
          source: { line: 4, text: "225 ??" },
        }),
        expect.objectContaining({
          code: "missing-exercise",
          source: { line: 1, text: "6@180" },
        }),
        expect.objectContaining({
          code: "missing-exercise",
          source: { line: 6, text: "2@235" },
        }),
      ]),
    );
    expect(result.exercises.map((exercise) => exercise.sets.length)).toEqual([
      1, 1, 1,
    ]);
  });

  it("preserves bodyweight shorthand for review without fabricating missing weights", () => {
    const result = parse("Pull up: 10, 9, 9");
    expect(
      result.exercises[0].sets.map((set) => [set.reps, set.weight]),
    ).toEqual([
      [10, null],
      [9, null],
      [9, null],
    ]);
    expect(
      result.issues.filter((issue) => issue.code === "missing-weight"),
    ).toHaveLength(3);
  });

  it("matches custom names and excludes archived exercises", () => {
    const result = parseWorkoutNote("Normal gym: 10@50", {
      noteUnit: "lb",
      catalog: [
        { slug: "custom:live", name: "Normal gym" },
        { slug: "custom:archived", name: "Normal gym", archived: true },
      ],
    });
    expect(result.exercises[0].slug).toBe("custom:live");
    expect(result.issues).toEqual([]);
  });

  it("requires review when the weight notation contradicts the catalog equipment", () => {
    for (const text of ["Deadlift: 6@10s", "Strict press: 6@10s, 5@45+10"]) {
      const result = parse(text);
      expect(result.exercises[0].slug).toBeNull();
      expect(
        result.issues.some((issue) => issue.code === "equipment-mismatch"),
      ).toBe(true);
    }
  });

  it("never pads empty headings or expands unsupported repetitions", () => {
    const result = parse("Deadlift\n3 sets 10 @ 150");
    expect(result.exercises[0].sets).toEqual([]);
    expect(result.issues.some((issue) => issue.code === "invalid-set")).toBe(
      true,
    );
    expect(parse("Deadlift:").exercises[0].sets).toEqual([]);
  });

  it.each(["0@100", "1001@100", "6@10001", "6@45++10", "6@-10"])(
    "flags invalid numbers without crediting them: %s",
    (text) => {
      const result = parse(`Deadlift: ${text}`);
      expect(result.issues.some((issue) => issue.code === "invalid-set")).toBe(
        true,
      );
      expect(result.exercises[0].sets.every((set) => set.weight === null)).toBe(
        true,
      );
    },
  );

  it("retains over-limit sets and exercises for review instead of silently dropping them", () => {
    const sets = parse(`Deadlift: ${Array(21).fill("1@100").join(", ")}`);
    expect(sets.exercises[0].sets).toHaveLength(21);
    expect(sets.issues.map((issue) => issue.code)).toContain("set-limit");
    const exercises = parse(Array(51).fill("Deadlift: 1@100").join("\n"));
    expect(exercises.exercises).toHaveLength(51);
    expect(exercises.issues.map((issue) => issue.code)).toContain(
      "exercise-limit",
    );
  });

  it("preserves CRLF text and spacing, reports original line numbers, and parses repeatably", () => {
    const text = "Deadlift \r\n\r\n 6 @ 180 \r\n";
    const result = parse(text);
    expect(result.originalText).toBe(text);
    expect(result.exercises[0].sets[0].source).toEqual({
      line: 3,
      text: " 6 @ 180 ",
    });
    expect(parse(text)).toEqual(result);
  });

  it("bounds note length and rejects invalid bar configuration", () => {
    expect(() => parse("n".repeat(20_001))).toThrow("20000 characters");
    expect(() =>
      parseWorkoutNote("", { noteUnit: "lb", catalog, barWeight: -1 }),
    ).toThrow("Bar weight");
  });
});
