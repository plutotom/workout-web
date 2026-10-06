import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

import { convertWeight as sharedConvertWeight } from "../../src/lib/workout-export";
import {
  convertWeight,
  importBundle,
  uniqueName,
  type PortableBundle,
} from "./portableTemplates";

function importHarness() {
  const rows: Record<string, Record<string, unknown>[]> = {
    users: [{ _id: "user_1", unit: "lb" }],
    workoutTemplates: [
      { _id: "old_template", userId: "user_1", name: "Leg day" },
    ],
    customExercises: [],
    templateExercises: [],
    exerciseNotes: [],
  };
  let sequence = 0;
  const query = vi.fn((table: string) => {
    const filters: [string, unknown][] = [];
    const result = () =>
      rows[table].filter((row) =>
        filters.every(([key, value]) => row[key] === value),
      );
    const builder = {
      eq(key: string, value: unknown) {
        filters.push([key, value]);
        return builder;
      },
    };
    return {
      withIndex: (_index: string, filter: (q: typeof builder) => unknown) => {
        filter(builder);
        return {
          collect: async () => [...result()],
          take: async (count: number) => result().slice(0, count),
          unique: async () => result()[0] ?? null,
        };
      },
    };
  });
  const db = {
    query,
    get: async (id: string) =>
      Object.values(rows)
        .flat()
        .find((row) => row._id === id) ?? null,
    insert: async (table: string, row: Record<string, unknown>) => {
      const id = `${table}_${++sequence}`;
      rows[table].push({ ...row, _id: id });
      return id;
    },
    patch: async (id: string, patch: Record<string, unknown>) => {
      const row = Object.values(rows)
        .flat()
        .find((row) => row._id === id)!;
      Object.assign(row, patch);
    },
  };
  return { ctx: { db } as unknown as MutationCtx, rows, query };
}

function bundle(slug = "squat"): PortableBundle {
  return {
    format: "workout.export",
    version: 1,
    exportedAt: 0,
    unit: "kg",
    templates: [
      {
        name: "Leg day",
        exercises: [{ slug, name: "Squat", sets: [{ weight: 100, reps: 5 }] }],
      },
    ],
    customExercises: [],
  };
}

describe("portable import database work", () => {
  it("skips custom-library scans for standard lifts while preserving names and unit conversion", async () => {
    const h = importHarness();
    const result = await importBundle(
      h.ctx,
      "user_1" as Id<"users">,
      bundle(),
      { includeNotes: false },
    );
    expect(
      h.query.mock.calls.filter(([table]) => table === "customExercises"),
    ).toHaveLength(0);
    expect(result.names).toEqual(["Leg day (2)"]);
    expect(result.customExercisesCreated).toBe(0);
    expect(h.rows.workoutTemplates[0].name).toBe("Leg day");
    expect(h.rows.templateExercises[0].sets).toEqual([
      { weight: 220, reps: 5 },
    ]);
  });

  it("still creates and remaps custom lifts with accurate import counts", async () => {
    const h = importHarness();
    const incoming = bundle("custom:sender_lift");
    incoming.customExercises = [
      {
        slug: "custom:sender_lift",
        name: "Squat",
        category: "legs",
        usesBar: true,
      },
    ];
    const result = await importBundle(
      h.ctx,
      "user_1" as Id<"users">,
      incoming,
      { includeNotes: false },
    );
    expect(result.customExercisesCreated).toBe(1);
    expect(h.rows.templateExercises[0].exerciseSlug).toBe(
      `custom:${h.rows.customExercises[0]._id}`,
    );
    const again = await importBundle(h.ctx, "user_1" as Id<"users">, incoming, {
      includeNotes: false,
    });
    expect(again.customExercisesCreated).toBe(0);
    expect(h.rows.customExercises).toHaveLength(1);
  });

  it("still recreates orphan custom lifts when older bundles omit their definitions", async () => {
    const h = importHarness();
    const result = await importBundle(
      h.ctx,
      "user_1" as Id<"users">,
      bundle("custom:orphan"),
      { includeNotes: false },
    );
    expect(result.customExercisesCreated).toBe(1);
    expect(h.rows.templateExercises[0].exerciseSlug).toBe(
      `custom:${h.rows.customExercises[0]._id}`,
    );
  });
});

describe("convertWeight", () => {
  it("matches the shared client helper — web and iOS must convert the same way", () => {
    const cases = [
      [185, "lb", "lb"],
      [100, "kg", "kg"],
      [100, "kg", "lb"],
      [60, "kg", "lb"],
      [225, "lb", "kg"],
      [45, "lb", "kg"],
      [0, "kg", "lb"],
      [0, "lb", "kg"],
    ] as const;
    for (const [weight, from, to] of cases) {
      expect(convertWeight(weight, from, to)).toBe(
        sharedConvertWeight(weight, from, to),
      );
    }
  });
  it("leaves weights alone when the units match", () => {
    expect(convertWeight(185, "lb", "lb")).toBe(185);
    expect(convertWeight(100, "kg", "kg")).toBe(100);
  });

  it("converts kg to lb", () => {
    expect(convertWeight(100, "kg", "lb")).toBe(220);
    expect(convertWeight(60, "kg", "lb")).toBe(132);
  });

  it("converts lb to kg", () => {
    expect(convertWeight(225, "lb", "kg")).toBe(102);
    expect(convertWeight(45, "lb", "kg")).toBe(20);
  });

  it("keeps 0 as 0 — it means 'no preset', not 'zero weight'", () => {
    expect(convertWeight(0, "kg", "lb")).toBe(0);
    expect(convertWeight(0, "lb", "kg")).toBe(0);
  });

  it("round-trips close to the original", () => {
    const original = 185;
    const there = convertWeight(original, "lb", "kg");
    expect(Math.abs(convertWeight(there, "kg", "lb") - original)).toBeLessThan(
      2,
    );
  });
});

describe("uniqueName", () => {
  it("keeps a free name as-is", () => {
    expect(uniqueName("Push Day", new Set())).toBe("Push Day");
  });

  it("suffixes a collision rather than overwriting", () => {
    expect(uniqueName("Push Day", new Set(["push day"]))).toBe("Push Day (2)");
  });

  it("keeps counting past the first collision", () => {
    const taken = new Set(["push day", "push day (2)"]);
    expect(uniqueName("Push Day", taken)).toBe("Push Day (3)");
  });

  it("matches case-insensitively", () => {
    expect(uniqueName("PUSH DAY", new Set(["push day"]))).toBe("PUSH DAY (2)");
  });

  it("reserves each name it hands out, so one import can't self-collide", () => {
    const taken = new Set<string>();
    expect(uniqueName("Legs", taken)).toBe("Legs");
    expect(uniqueName("Legs", taken)).toBe("Legs (2)");
    expect(uniqueName("Legs", taken)).toBe("Legs (3)");
  });

  it("falls back to Untitled for a blank name", () => {
    expect(uniqueName("   ", new Set())).toBe("Untitled");
  });

  it("trims before comparing", () => {
    expect(uniqueName("  Push Day  ", new Set(["push day"]))).toBe(
      "Push Day (2)",
    );
  });
});
