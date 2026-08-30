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

  it("includes triathlon sports on the history line", () => {
    expect(
      summarizeSessionExercises([], (slug) => slug, {
        sessionKind: "health_summary",
        sourceName: "Apple Watch",
        distanceMeters: 34200,
        energyKcal: 1480,
        healthSegments: [
          {
            activityType: "swimming",
            activityName: "Swim",
            startedAt: 1,
            endedAt: 2,
            durationSeconds: 1920,
            distanceMeters: 1500,
            energyKcal: 280,
          },
          {
            activityType: "cycling",
            activityName: "Bike",
            startedAt: 2,
            endedAt: 3,
            durationSeconds: 3600,
            distanceMeters: 25000,
            energyKcal: 720,
          },
          {
            activityType: "running",
            activityName: "Run",
            startedAt: 3,
            endedAt: 4,
            durationSeconds: 4920,
            distanceMeters: 7700,
            energyKcal: 480,
          },
        ],
      }),
    ).toBe("Health · Apple Watch · Swim · Bike · Run · 21.3 mi · 1480 kcal");
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
