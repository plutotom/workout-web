import { describe, expect, it } from "vitest";

import {
  browseExercises,
  customExerciseId,
  exerciseDetailPath,
} from "@/lib/exercise-browser";
import type { Exercise } from "@/lib/exercises";

const bench: Exercise = {
  slug: "bench",
  name: "Bench Press (Barbell)",
  short: "Bench",
  category: "chest",
};

const curl: Exercise = {
  slug: "bicep-curl",
  name: "Bicep Curl (Dumbbell)",
  short: "Bicep Curl",
  category: "arms",
};

const custom: Exercise = {
  slug: "custom:abc",
  name: "Cable Pull-Through",
  short: "Pull-Through",
  category: "legs",
  custom: true,
};

const archived: Exercise = {
  slug: "custom:old",
  name: "Old Lift",
  short: "Old",
  category: "back",
  custom: true,
  archived: true,
};

describe("browseExercises", () => {
  it("defaults to A–Z across the full catalog", () => {
    const rows = browseExercises([curl, bench, custom], [], {
      query: "",
      group: "all",
      sort: "az",
      lastUsedAt: new Map(),
      includeArchived: false,
      customOnly: false,
    });
    expect(rows.map((e) => e.slug)).toEqual([
      "bench",
      "bicep-curl",
      "custom:abc",
    ]);
  });

  it("filters by muscle and search", () => {
    const rows = browseExercises([curl, bench, custom], [], {
      query: "bench",
      group: "chest",
      sort: "az",
      lastUsedAt: new Map(),
      includeArchived: false,
      customOnly: false,
    });
    expect(rows.map((e) => e.slug)).toEqual(["bench"]);
  });

  it("sorts recently used first, unused A–Z after", () => {
    const rows = browseExercises([curl, bench, custom], [], {
      query: "",
      group: "all",
      sort: "recent",
      lastUsedAt: new Map([
        ["custom:abc", 200],
        ["bench", 100],
      ]),
      includeArchived: false,
      customOnly: false,
    });
    expect(rows.map((e) => e.slug)).toEqual([
      "custom:abc",
      "bench",
      "bicep-curl",
    ]);
  });

  it("puts custom lifts first", () => {
    const rows = browseExercises([curl, bench, custom], [], {
      query: "",
      group: "all",
      sort: "custom",
      lastUsedAt: new Map(),
      includeArchived: false,
      customOnly: false,
    });
    expect(rows[0]?.slug).toBe("custom:abc");
  });

  it("hides archived unless asked", () => {
    const hidden = browseExercises([bench], [archived], {
      query: "",
      group: "all",
      sort: "az",
      lastUsedAt: new Map(),
      includeArchived: false,
      customOnly: false,
    });
    expect(hidden.map((e) => e.slug)).toEqual(["bench"]);

    const shown = browseExercises([bench], [archived], {
      query: "",
      group: "all",
      sort: "az",
      lastUsedAt: new Map(),
      includeArchived: true,
      customOnly: false,
    });
    expect(shown.map((e) => e.slug)).toEqual(["bench", "custom:old"]);
  });
});

describe("customExerciseId", () => {
  it("parses custom slugs and rejects curated ones", () => {
    expect(customExerciseId("custom:k17abc")).toBe("k17abc");
    expect(customExerciseId("bench")).toBeNull();
    expect(customExerciseId("custom:")).toBeNull();
  });
});

describe("exerciseDetailPath", () => {
  it("encodes the slug and optional query", () => {
    expect(exerciseDetailPath("custom:abc", { from: "/insights" })).toBe(
      "/exercises/custom%3Aabc?from=%2Finsights",
    );
  });
});
