import { describe, expect, it } from "vitest";

import { buildStarterTemplates } from "./templates";

describe("buildStarterTemplates", () => {
  it("builds three commercial-gym templates with strength defaults", () => {
    const templates = buildStarterTemplates({
      goal: "strength",
      setting: "commercial-gym",
    });

    expect(templates).toHaveLength(3);
    expect(templates.map((template) => template.name)).toEqual([
      "Starter A",
      "Starter B",
      "Starter C",
    ]);
    expect(templates[0]?.exercises.map((exercise) => exercise.slug)).toEqual([
      "bench",
      "barbell-row",
      "squat",
      "ohp",
    ]);
    expect(templates[0]?.exercises[0]?.sets).toEqual([
      { weight: 0, reps: 5 },
      { weight: 0, reps: 5 },
      { weight: 0, reps: 5 },
      { weight: 0, reps: 5 },
    ]);
  });

  it("uses bodyweight movements and habit defaults", () => {
    const templates = buildStarterTemplates({
      goal: "habit",
      setting: "bodyweight",
    });

    expect(templates).toHaveLength(3);
    const sets = templates.flatMap((template) =>
      template.exercises.flatMap((exercise) => exercise.sets),
    );
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.every((set) => set.weight === 0 && set.reps === 8)).toBe(true);
  });
});
