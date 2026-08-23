import { describe, expect, it } from "vitest";

import { summarizeSessionExercises } from "./map-sessions";

describe("summarizeSessionExercises", () => {
  it("uses Health summary copy instead of empty set text", () => {
    expect(
      summarizeSessionExercises([], (slug) => slug, {
        sessionKind: "health_summary",
        sourceName: "Apple Watch",
        distanceMeters: 5000,
        energyKcal: 410,
      }),
    ).toBe("Health · Apple Watch · 3.11 mi · 410 kcal");
  });

  it("keeps lifting summaries for tracked sessions", () => {
    expect(
      summarizeSessionExercises(
        [{ slug: "bench-press", completedCount: 4 }],
        (slug) => (slug === "bench-press" ? "Bench" : slug),
      ),
    ).toBe("Bench 4");
  });
});
