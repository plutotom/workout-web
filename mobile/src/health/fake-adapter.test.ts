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
});
