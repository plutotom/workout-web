import { describe, expect, it } from "vitest";

import { EXERCISES } from "./exercises";
import examples from "./fixtures/note-workouts/user-examples.json";
import {
  createNoteConversionPreview,
  confirmNoteConversion,
  reviewNoteConversionPreview,
  workoutNoteCatalog,
} from "./note-conversion-preview";

const create = (text: string, unit: "lb" | "kg" = "lb") =>
  createNoteConversionPreview(text, unit, EXERCISES);
const review = (draft: ReturnType<typeof create>) =>
  reviewNoteConversionPreview(draft, EXERCISES);

describe("editable note conversion preview", () => {
  it("confirms only reviewed sets, converts units explicitly, and annotates failure without an extra set", () => {
    const draft = create("Deadlift: 4@100kgF, 2@225lb");
    expect(confirmNoteConversion(draft, EXERCISES, "lb")).toEqual([
      {
        slug: "deadlift",
        notes: "Set 1: failed attempt after 4 completed reps.",
        sets: [
          { reps: 4, weight: 220 },
          { reps: 2, weight: 225 },
        ],
      },
    ]);
    expect(confirmNoteConversion(draft, EXERCISES, "kg")[0].sets).toEqual([
      { reps: 4, weight: 100 },
      { reps: 2, weight: 102 },
    ]);
    expect(draft.originalText).toBe("Deadlift: 4@100kgF, 2@225lb");
  });
  it("rejects unresolved drafts, fractional values and overflow after unit conversion", () => {
    expect(() =>
      confirmNoteConversion(create("Gym: 4@50"), EXERCISES, "lb"),
    ).toThrow("Choose an exercise");
    expect(() =>
      confirmNoteConversion(create("Deadlift: 4@12.5"), EXERCISES, "lb"),
    ).toThrow("Fractional");
    expect(() =>
      confirmNoteConversion(create("Deadlift: 4@5000kg"), EXERCISES, "lb"),
    ).toThrow("Converted weight");
  });
  it("uses confirmed shorthand in the app, preserving every original character", () => {
    const text = examples[0].noteBody;
    const draft = create(text);
    expect(draft.originalText).toBe(text);
    expect(draft.exercises[0].slug).toBe("overhead-press-dumbbell");
    expect(draft.exercises[0].sets[3]).toMatchObject({
      reps: "4",
      weight: "25",
      failedAttempt: true,
    });
    expect(draft.exercises[3].sets[0].weight).toBe("155");
    expect(review(draft)).toEqual([
      {
        exerciseId: draft.exercises[2].id,
        message: "Choose an exercise for this section.",
      },
    ]);
  });

  it("clears name ambiguity only after a valid catalog selection", () => {
    const draft = create("Press: 6@10, 4@20");
    expect(draft.exercises[0].slug).toBeNull();
    expect(review(draft)).toHaveLength(1);
    draft.exercises[0].slug = "overhead-press-dumbbell";
    expect(review(draft)).toEqual([]);
    draft.exercises[0].slug = "made-up-exercise";
    expect(review(draft)).toHaveLength(1);
  });

  it("recomputes missing-weight and fractional-weight warnings after manual correction", () => {
    const draft = create("Deadlift\n6\n4@12.5");
    expect(review(draft)).toHaveLength(2);
    draft.exercises[0].sets[0].weight = "0";
    draft.exercises[0].sets[1].weight = "13";
    expect(review(draft)).toEqual([]);
    expect(draft.originalText).toBe("Deadlift\n6\n4@12.5");
  });

  it("does not guess a kg bar; accepts the total entered by the reviewer", () => {
    const draft = create("Back squat: 5@20+5", "kg");
    expect(draft.exercises[0].sets[0]).toMatchObject({
      weight: "",
      unit: "kg",
    });
    expect(review(draft)).toHaveLength(1);
    draft.exercises[0].sets[0].weight = "70";
    expect(review(draft)).toEqual([]);
  });

  it("keeps explicit units even when the saved note used another unit", () => {
    const draft = create("Deadlift: 6@180lb, 4@100kg", "kg");
    expect(
      draft.exercises[0].sets.map((set) => [set.weight, set.unit]),
    ).toEqual([
      ["180", "lb"],
      ["100", "kg"],
    ]);
    expect(review(draft)).toEqual([]);
  });

  it("retains unsupported source lines until explicitly kept as note text", () => {
    const draft = create("Deadlift\n6@180\n225 ??\n4@bad, 2@bad");
    expect(draft.exercises[0].sets).toHaveLength(1);
    expect(draft.unparsed.map((line) => line.source)).toEqual([
      { line: 3, text: "225 ??" },
      { line: 4, text: "4@bad, 2@bad" },
    ]);
    expect(review(draft)).toHaveLength(2);
    draft.unparsed.forEach((line) => {
      line.keptAsNote = true;
    });
    expect(review(draft)).toEqual([]);
    expect(draft.originalText).toContain("225 ??");
  });

  it.each(["", "-1", "0", "1.5", "1001", "Infinity", "4 reps"])(
    "flags invalid edited reps %j",
    (reps) => {
      const draft = create("Deadlift: 6@180");
      draft.exercises[0].sets[0].reps = reps;
      expect(review(draft)[0].message).toContain("completed reps");
    },
  );

  it.each(["", "-1", "10001", "Infinity", "1e2", "45+10"])(
    "flags invalid edited weight %j without silently evaluating it",
    (weight) => {
      const draft = create("Deadlift: 6@180");
      draft.exercises[0].sets[0].weight = weight;
      expect(review(draft)[0].message).toContain("weight");
    },
  );

  it("keeps equipment warnings after a reviewer selects a conflicting lift", () => {
    const draft = create("Strict press: 6@10s");
    draft.exercises[0].slug = "ohp";
    expect(review(draft)[0].message).toContain("equipment");
    draft.exercises[0].slug = "overhead-press-dumbbell";
    expect(review(draft)).toEqual([]);
  });

  it("requires review when removing all sets or exceeding the saved-workout limits", () => {
    const draft = create("Deadlift: 6@180");
    const row = draft.exercises[0].sets[0];
    draft.exercises[0].sets = [];
    expect(review(draft)[0].message).toContain("Add a set");
    draft.exercises[0].sets = Array.from({ length: 21 }, (_, i) => ({
      ...row,
      id: `row-${i}`,
    }));
    expect(review(draft)[0].message).toContain("20 sets");
    draft.exercises = Array.from({ length: 51 }, (_, i) => ({
      ...draft.exercises[0],
      id: `lift-${i}`,
      sets: [row],
    }));
    expect(review(draft)[0].message).toContain("50 exercises");
  });

  it("matches active custom lifts and excludes archived ones", () => {
    const catalog = [
      ...EXERCISES,
      { slug: "custom:row", name: "My row", archived: false },
    ];
    const draft = createNoteConversionPreview("My row: 6@50", "lb", catalog);
    expect(draft.exercises[0].slug).toBe("custom:row");
    expect(reviewNoteConversionPreview(draft, catalog)).toEqual([]);
    expect(
      reviewNoteConversionPreview(
        draft,
        catalog.map((e) =>
          e.slug === "custom:row" ? { ...e, archived: true } : e,
        ),
      ),
    ).toHaveLength(1);
    expect(
      workoutNoteCatalog([
        { slug: "squat", name: "Squat", aliases: ["My squat"] },
      ])[0].aliases,
    ).toEqual(["My squat", "Back squat"]);
  });

  it("opening a fresh preview discards earlier edits and leaves the input unchanged", () => {
    const original = "Deadlift: 6@180F";
    const draft = create(original);
    draft.exercises[0].sets[0].reps = "5";
    draft.exercises[0].sets[0].failedAttempt = false;
    expect(create(original).exercises[0].sets[0]).toMatchObject({
      reps: "6",
      failedAttempt: true,
    });
    expect(draft.originalText).toBe(original);
  });
});
