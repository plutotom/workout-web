import { describe, expect, it } from "vitest";

import { getLocalOverview } from "./insights";
import type { LocalInsightsSession } from "./repository";

function session(
  overrides: Partial<LocalInsightsSession> &
    Pick<LocalInsightsSession, "sessionId" | "sessionKind" | "completedAt">,
): LocalInsightsSession {
  return {
    remoteId: null,
    templateId: null,
    remoteTemplateId: null,
    templateName: "Run",
    startedAt: overrides.completedAt - 30 * 60 * 1000,
    countsTowardGoals: true,
    health: null,
    exercises: [],
    placeId: null,
    placeName: null,
    ...overrides,
  };
}

describe("getLocalOverview health summaries", () => {
  const now = Date.parse("2026-08-22T18:00:00.000Z");

  it("counts a manually imported Health workout toward the weekly goal", () => {
    const overview = getLocalOverview(
      [
        session({
          sessionId: "health-run",
          sessionKind: "health_summary",
          completedAt: now - 2 * 60 * 60 * 1000,
          health: {
            provider: "apple_health",
            externalId: "ABC",
            activityType: "running",
            sourceName: "Apple Watch",
            sourceBundleId: "com.apple.health",
            durationSeconds: 1800,
            energyKcal: 410,
            distanceMeters: 5000,
            importedAt: now,
          },
        }),
      ],
      7,
      now,
    );

    expect(overview.stats.workoutCount).toBe(1);
    expect(overview.stats.totalVolume).toBe(0);
    expect(overview.stats.totalDurationMs).toBe(1_800_000);
    expect(overview.recentSessions[0]?.sessionKind).toBe("health_summary");
  });

  it("does not count a tracked session with no logged sets", () => {
    const overview = getLocalOverview(
      [
        session({
          sessionId: "empty-tracked",
          sessionKind: "tracked",
          templateName: "Push",
          completedAt: now - 60 * 60 * 1000,
          countsTowardGoals: true,
        }),
      ],
      7,
      now,
    );
    expect(overview.stats.workoutCount).toBe(0);
  });

  it("keeps lifting volume on tracked sessions and ignores Health summaries", () => {
    const overview = getLocalOverview(
      [
        session({
          sessionId: "health-run",
          sessionKind: "health_summary",
          completedAt: now - 3 * 60 * 60 * 1000,
        }),
        session({
          sessionId: "push",
          sessionKind: "tracked",
          templateName: "Push",
          completedAt: now - 2 * 60 * 60 * 1000,
          exercises: [
            {
              slug: "bench-press",
              sets: [
                {
                  orderIndex: 0,
                  weight: 185,
                  reps: 5,
                  completed: true,
                },
              ],
            },
          ],
        }),
      ],
      7,
      now,
    );

    expect(overview.stats.workoutCount).toBe(2);
    expect(overview.stats.totalVolume).toBe(925);
    expect(overview.topLifts.map((lift) => lift.slug)).toEqual(["bench-press"]);
  });
});
