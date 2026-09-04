import { describe, expect, it } from "vitest";

import { getLocalOverview, getLocalWorkoutRecap } from "./insights";
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

describe("getLocalWorkoutRecap place scoping", () => {
  const now = Date.parse("2026-09-04T18:00:00.000Z");
  const homeId = "place-home";

  function lift(
    id: string,
    completedAt: number,
    extras: { placeId?: string | null; weight: number },
  ) {
    return session({
      sessionId: id,
      sessionKind: "tracked",
      templateName: "Push",
      completedAt,
      placeId: extras.placeId ?? null,
      exercises: [
        {
          slug: "bench-press",
          sets: [
            {
              orderIndex: 0,
              weight: extras.weight,
              reps: 5,
              completed: true,
            },
          ],
        },
      ],
    });
  }

  it("counts untagged history as Home when recapping a Home session", () => {
    const recap = getLocalWorkoutRecap(
      [
        lift("today-home", now, { placeId: homeId, weight: 275 }),
        lift("legacy", now - 7 * 24 * 60 * 60 * 1000, {
          placeId: null,
          weight: 225,
        }),
      ],
      "today-home",
      homeId,
    );

    expect(recap?.standout?.priorBest).toMatchObject({ weight: 225, reps: 5 });
    expect(recap?.standout?.isPr).toBe(true);
  });

  it("does not count Home history toward an Elgin recap", () => {
    const recap = getLocalWorkoutRecap(
      [
        lift("today-elgin", now, { placeId: "place-elgin", weight: 300 }),
        lift("legacy", now - 7 * 24 * 60 * 60 * 1000, {
          placeId: null,
          weight: 225,
        }),
      ],
      "today-elgin",
      homeId,
    );

    expect(recap?.standout?.priorBest).toBeNull();
    expect(recap?.standout?.isPr).toBe(true);
  });
});
