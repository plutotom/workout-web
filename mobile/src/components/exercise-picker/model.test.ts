import { describe, expect, it } from "vitest";
import type { Exercise } from "@shared/exercises";

import {
  addLabel,
  equipmentOf,
  filterExercises,
  matchesQuery,
  pickerTitle,
  sectionsByEquipment,
  sectionsByMuscle,
  splitRecents,
  toggleSlug,
  unusedExercises,
} from "./model";

const bench: Exercise = {
  slug: "bench",
  name: "Bench Press (Barbell)",
  short: "Bench",
  category: "chest",
};
const fly: Exercise = {
  slug: "db-fly",
  name: "Chest Fly (Dumbbell)",
  short: "Fly",
  category: "chest",
};
const row: Exercise = {
  slug: "cable-row",
  name: "Seated Row (Cable)",
  short: "Row",
  category: "back",
};
const squat: Exercise = {
  slug: "squat",
  name: "Back Squat",
  short: "Squat",
  category: "legs",
};
const custom: Exercise = {
  slug: "custom:1",
  name: "Cable Y Raise",
  short: "Y Raise",
  category: "shoulders",
  custom: true,
};

describe("unusedExercises", () => {
  it("hides lifts already on the workout", () => {
    expect(
      unusedExercises([bench, fly, row], ["bench"]).map(
        (exercise) => exercise.slug,
      ),
    ).toEqual(["db-fly", "cable-row"]);
  });
});

describe("matchesQuery", () => {
  it("matches name or short name, ignoring case and padding", () => {
    expect(matchesQuery(bench, "  BENCH ")).toBe(true);
    expect(matchesQuery(custom, "y raise")).toBe(true);
    expect(matchesQuery(row, "squat")).toBe(false);
  });
});

describe("filterExercises", () => {
  it("returns the full list when the query is empty", () => {
    expect(filterExercises([bench, row], "")).toEqual([bench, row]);
  });
});

describe("splitRecents", () => {
  it("puts recently completed lifts first and frequent lifts next", () => {
    const usage = {
      lastUsedAt: new Map([
        ["bench", 30],
        ["squat", 10],
        ["cable-row", 20],
      ]),
      sessionCount: new Map([
        ["db-fly", 8],
        ["bench", 2],
        ["custom:1", 1],
      ]),
    };
    const split = splitRecents([bench, fly, row, squat, custom], usage, 2, 2);
    expect(split.recents.map((exercise) => exercise.slug)).toEqual([
      "bench",
      "cable-row",
    ]);
    expect(split.frequent.map((exercise) => exercise.slug)).toEqual(["db-fly"]);
    expect(split.rest.map((exercise) => exercise.slug)).toEqual([
      "squat",
      "custom:1",
    ]);
  });
});

describe("sectionsByMuscle", () => {
  it("drops empty groups and keeps catalog order inside a group", () => {
    const sections = sectionsByMuscle([row, bench, fly]);
    expect(sections.map((section) => section.id)).toEqual(["chest", "back"]);
    expect(sections[0]?.data.map((exercise) => exercise.slug)).toEqual([
      "bench",
      "db-fly",
    ]);
  });
});

describe("equipmentOf", () => {
  it("classifies from the lift name, not the barbell heuristic", () => {
    expect(equipmentOf(bench)).toBe("barbell");
    expect(equipmentOf(fly)).toBe("dumbbell");
    expect(equipmentOf(row)).toBe("cable");
    expect(equipmentOf(squat)).toBe("other");
  });
});

describe("sectionsByEquipment", () => {
  it("groups a mixed list without empty buckets", () => {
    const sections = sectionsByEquipment([bench, fly, row, squat]);
    expect(sections.map((section) => section.id)).toEqual([
      "barbell",
      "dumbbell",
      "cable",
      "other",
    ]);
  });
});

describe("toggleSlug", () => {
  it("multi-selects in add mode and stays single-select in replace mode", () => {
    expect(toggleSlug([], "bench", "add")).toEqual(["bench"]);
    expect(toggleSlug(["bench"], "row", "add")).toEqual(["bench", "row"]);
    expect(toggleSlug(["bench", "row"], "bench", "add")).toEqual(["row"]);
    expect(toggleSlug(["bench"], "row", "replace")).toEqual(["row"]);
    expect(toggleSlug(["row"], "row", "replace")).toEqual([]);
  });
});

describe("copy", () => {
  it("keeps confirm labels aligned with the current picker", () => {
    expect(pickerTitle("add")).toBe("Add exercises");
    expect(pickerTitle("replace")).toBe("Replace exercise");
    expect(addLabel("add", 0)).toBe("Select exercises");
    expect(addLabel("add", 1)).toBe("Add 1 exercise");
    expect(addLabel("add", 2)).toBe("Add 2 exercises");
    expect(addLabel("replace", 0)).toBe("Select exercise");
    expect(addLabel("replace", 1)).toBe("Replace");
  });
});
