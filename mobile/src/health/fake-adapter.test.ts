import { describe, expect, it } from "vitest";

import {
  createFakeHealthAdapter,
  createUnavailableHealthAdapter,
  sampleHealthWorkouts,
} from "./fake-adapter";

describe("createUnavailableHealthAdapter", () => {
  it("never claims Health is available", async () => {
    const adapter = createUnavailableHealthAdapter();
    expect(await adapter.isAvailable()).toBe(false);
    expect(await adapter.getAuthorizationState()).toBe("unavailable");
    expect(await adapter.requestReadAccess()).toBe("unavailable");
    expect(await adapter.queryRecentWorkouts({ since: 0 })).toEqual([]);
    expect(await adapter.getWriteAuthorizationState()).toBe("unavailable");
    expect(await adapter.requestWriteAccess()).toBe("unavailable");
    await expect(
      adapter.saveTrackedWorkout({
        sessionId: "session-1",
        startedAt: 1,
        endedAt: 2,
      }),
    ).rejects.toThrow(/unavailable/i);
    expect(await adapter.queryWorkoutsSinceAnchor({ anchor: null })).toEqual({
      workouts: [],
      deletedUuids: [],
      newAnchor: null,
    });
    expect(await adapter.enableBackgroundDelivery()).toBe(false);
    expect(await adapter.disableBackgroundDelivery()).toBe(false);
  });
});

describe("createFakeHealthAdapter", () => {
  it("requires authorization before returning workouts", async () => {
    const now = Date.parse("2026-08-22T18:00:00.000Z");
    const adapter = createFakeHealthAdapter({
      workouts: sampleHealthWorkouts(now),
    });
    expect(await adapter.getAuthorizationState()).toBe("not_requested");
    expect(await adapter.queryRecentWorkouts({ since: 0 })).toEqual([]);

    expect(await adapter.requestReadAccess()).toBe("connected");
    const workouts = await adapter.queryRecentWorkouts({
      since: now - 90 * 24 * 60 * 60 * 1000,
    });
    expect(workouts.map((workout) => workout.uuid)).toEqual([
      "health-run-1",
      "health-tri-1",
      "health-strength-1",
    ]);
  });

  it("treats limited access as an empty result, not a denial flag", async () => {
    const adapter = createFakeHealthAdapter({
      authorization: "limited",
      workouts: sampleHealthWorkouts(),
    });
    expect(await adapter.getAuthorizationState()).toBe("limited");
    expect(await adapter.queryRecentWorkouts({ since: 0 })).toEqual([]);
  });

  it("saves a tracked workout once and keeps it out of the import list", async () => {
    const now = Date.parse("2026-08-22T18:00:00.000Z");
    const adapter = createFakeHealthAdapter({
      authorization: "connected",
      writeAuthorization: "connected",
      workouts: sampleHealthWorkouts(now),
    });

    const first = await adapter.saveTrackedWorkout({
      sessionId: "session-1",
      startedAt: now - 60 * 60 * 1000,
      endedAt: now,
    });
    const second = await adapter.saveTrackedWorkout({
      sessionId: "session-1",
      startedAt: now - 60 * 60 * 1000,
      endedAt: now,
    });
    expect(first.uuid).toBe("export-session-1");
    expect(second.uuid).toBe(first.uuid);

    const workouts = await adapter.queryRecentWorkouts({
      since: now - 90 * 24 * 60 * 60 * 1000,
    });
    expect(workouts.map((workout) => workout.uuid)).toEqual([
      "health-run-1",
      "health-tri-1",
      "health-strength-1",
    ]);
  });

  it("does not save until write access is requested", async () => {
    const adapter = createFakeHealthAdapter({
      authorization: "connected",
    });
    await expect(
      adapter.saveTrackedWorkout({
        sessionId: "session-1",
        startedAt: 1,
        endedAt: 2,
      }),
    ).rejects.toThrow(/write access/i);
    expect(await adapter.requestWriteAccess()).toBe("connected");
    await expect(
      adapter.saveTrackedWorkout({
        sessionId: "session-1",
        startedAt: 1,
        endedAt: 2,
      }),
    ).resolves.toEqual({ uuid: "export-session-1" });
  });

  it("returns only new workouts after an anchor and skips exported ones", async () => {
    const now = Date.parse("2026-08-22T18:00:00.000Z");
    const adapter = createFakeHealthAdapter({
      authorization: "connected",
      writeAuthorization: "connected",
      workouts: sampleHealthWorkouts(now),
    });
    await adapter.saveTrackedWorkout({
      sessionId: "session-1",
      startedAt: now - 60 * 60 * 1000,
      endedAt: now,
    });

    const first = await adapter.queryWorkoutsSinceAnchor({
      anchor: null,
      limit: 1,
    });
    expect(first.workouts.map((workout) => workout.uuid)).toEqual([
      "health-strength-1",
    ]);
    const second = await adapter.queryWorkoutsSinceAnchor({
      anchor: first.newAnchor,
      limit: 10,
    });
    expect(second.workouts.map((workout) => workout.uuid)).toEqual([
      "health-tri-1",
      "health-run-1",
    ]);
  });
});
