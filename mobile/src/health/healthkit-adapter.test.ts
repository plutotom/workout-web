import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { createHealthKitAdapter, mapRequestStatus } from "./healthkit-adapter";

function workoutSample(uuid: string, startedAt: number) {
  return {
    uuid,
    workoutActivityType: "running",
    startDate: startedAt,
    endDate: startedAt + 30 * 60 * 1000,
    duration: 1800,
    totalEnergyBurned: { quantity: 300, unit: "kcal" },
    sourceRevision: {
      source: { name: "Apple Watch", bundleIdentifier: "com.apple.health" },
    },
  };
}

describe("mapRequestStatus", () => {
  it("treats unknown as not requested so opening settings does not prompt", () => {
    expect(mapRequestStatus(0)).toBe("not_requested");
    expect(mapRequestStatus("unknown")).toBe("not_requested");
    expect(mapRequestStatus(undefined)).toBe("not_requested");
  });

  it("maps Apple's shouldRequest / unnecessary values", () => {
    expect(mapRequestStatus(1)).toBe("not_requested");
    expect(mapRequestStatus("shouldRequest")).toBe("not_requested");
    expect(mapRequestStatus(2)).toBe("connected");
    expect(mapRequestStatus("unnecessary")).toBe("connected");
  });
});

const allowPrompt = {
  bundleAllowsHealthPrompt: async () => true,
};

describe("createHealthKitAdapter", () => {
  it("does not request authorization when listing workouts", async () => {
    const requestAuthorization = vi.fn(async () => true);
    const adapter = createHealthKitAdapter(
      {
        isHealthDataAvailable: () => true,
        requestAuthorization,
        queryWorkoutSamples: async () => [
          workoutSample("run-1", Date.parse("2026-08-01T12:00:00.000Z")),
        ],
      },
      allowPrompt,
    );

    const workouts = await adapter.queryRecentWorkouts({
      since: Date.parse("2026-07-01T00:00:00.000Z"),
    });

    expect(requestAuthorization).not.toHaveBeenCalled();
    expect(workouts.map((workout) => workout.uuid)).toEqual(["run-1"]);
  });

  it("treats a failed status check as not requested, not connected", async () => {
    const adapter = createHealthKitAdapter(
      {
        isHealthDataAvailable: () => true,
        getRequestStatusForAuthorization: async () => {
          throw new Error("HealthKit not configured");
        },
        requestAuthorization: async () => {
          throw new Error("should not prompt on mount");
        },
      },
      allowPrompt,
    );

    expect(await adapter.getAuthorizationState()).toBe("not_requested");
  });

  it("prompts only from requestReadAccess and swallows authorization errors", async () => {
    const requestAuthorization = vi.fn(async () => {
      throw new Error("NSHealthShareUsageDescription missing");
    });
    const adapter = createHealthKitAdapter(
      {
        isHealthDataAvailable: () => true,
        requestAuthorization,
        getRequestStatusForAuthorization: async () => 1,
      },
      allowPrompt,
    );

    expect(await adapter.requestReadAccess()).toBe("not_requested");
    expect(requestAuthorization).toHaveBeenCalledTimes(1);
  });

  it("skips native auth when the installed Info.plist lacks the usage description", async () => {
    const requestAuthorization = vi.fn(async () => true);
    const adapter = createHealthKitAdapter(
      {
        isHealthDataAvailable: () => true,
        requestAuthorization,
      },
      { bundleAllowsHealthPrompt: async () => false },
    );

    expect(await adapter.isAvailable()).toBe(false);
    expect(await adapter.getAuthorizationState()).toBe("unavailable");
    expect(await adapter.requestReadAccess()).toBe("unavailable");
    expect(requestAuthorization).not.toHaveBeenCalled();
  });

  it("requests write types only from requestWriteAccess", async () => {
    const requestAuthorization = vi.fn(async () => true);
    const adapter = createHealthKitAdapter(
      {
        isHealthDataAvailable: () => true,
        requestAuthorization,
        getRequestStatusForAuthorization: async (options) =>
          options.toShare?.length ? 2 : 1,
      },
      allowPrompt,
    );

    expect(await adapter.getWriteAuthorizationState()).toBe("connected");
    expect(await adapter.requestReadAccess()).toBe("not_requested");
    expect(requestAuthorization).toHaveBeenCalledWith({
      toRead: ["HKWorkoutTypeIdentifier"],
    });

    expect(await adapter.requestWriteAccess()).toBe("connected");
    expect(requestAuthorization).toHaveBeenCalledWith({
      toRead: ["HKWorkoutTypeIdentifier"],
      toShare: ["HKWorkoutTypeIdentifier"],
    });
  });

  it("saves a tracked workout without prompting and without inventing calories", async () => {
    const requestAuthorization = vi.fn(async () => true);
    const saveWorkoutSample = vi.fn(async () => ({ uuid: "hk-uuid-1" }));
    const adapter = createHealthKitAdapter(
      {
        isHealthDataAvailable: () => true,
        requestAuthorization,
        saveWorkoutSample,
      },
      allowPrompt,
    );

    const startedAt = Date.parse("2026-08-22T12:00:00.000Z");
    const endedAt = Date.parse("2026-08-22T13:10:00.000Z");
    const saved = await adapter.saveTrackedWorkout({
      sessionId: "session-1",
      startedAt,
      endedAt,
    });

    expect(saved).toEqual({ uuid: "hk-uuid-1" });
    expect(requestAuthorization).not.toHaveBeenCalled();
    expect(saveWorkoutSample).toHaveBeenCalledTimes(1);
    expect(saveWorkoutSample.mock.calls[0]).toEqual([
      50,
      [],
      new Date(startedAt),
      new Date(endedAt),
      undefined,
      {
        HKMetadataKeySyncIdentifier:
          "com.isaiahproctor.workout.local:session:session-1",
        HKMetadataKeySyncVersion: 1,
      },
    ]);
  });

  it("filters exported workouts out of the import list by bundle and sync id", async () => {
    const adapter = createHealthKitAdapter(
      {
        isHealthDataAvailable: () => true,
        queryWorkoutSamples: async () => [
          workoutSample("run-1", Date.parse("2026-08-01T12:00:00.000Z")),
          {
            uuid: "ours-bundle",
            workoutActivityType: 50,
            startDate: Date.parse("2026-08-01T13:00:00.000Z"),
            endDate: Date.parse("2026-08-01T14:00:00.000Z"),
            sourceRevision: {
              source: {
                name: "Workout",
                bundleIdentifier: "com.isaiahproctor.workout.local",
              },
            },
          },
          {
            uuid: "ours-sync",
            workoutActivityType: 50,
            startDate: Date.parse("2026-08-01T15:00:00.000Z"),
            endDate: Date.parse("2026-08-01T16:00:00.000Z"),
            sourceRevision: {
              source: {
                name: "Health",
                bundleIdentifier: "com.apple.health",
              },
            },
            metadata: {
              HKMetadataKeySyncIdentifier:
                "com.isaiahproctor.workout.local:session:session-9",
            },
          },
        ],
      },
      allowPrompt,
    );

    const workouts = await adapter.queryRecentWorkouts({
      since: Date.parse("2026-07-01T00:00:00.000Z"),
    });
    expect(workouts.map((workout) => workout.uuid)).toEqual(["run-1"]);
  });

  it("does not request authorization when reading the HealthKit anchor", async () => {
    const requestAuthorization = vi.fn(async () => true);
    const queryWorkoutSamplesWithAnchor = vi.fn(async () => ({
      workouts: [
        workoutSample("run-2", Date.parse("2026-08-21T12:00:00.000Z")),
      ],
      deletedSamples: [{ uuid: "gone-1" }],
      newAnchor: "anchor-2",
    }));
    const adapter = createHealthKitAdapter(
      {
        isHealthDataAvailable: () => true,
        requestAuthorization,
        queryWorkoutSamplesWithAnchor,
      },
      allowPrompt,
    );

    const page = await adapter.queryWorkoutsSinceAnchor({
      anchor: "anchor-1",
      limit: 50,
    });

    expect(requestAuthorization).not.toHaveBeenCalled();
    expect(queryWorkoutSamplesWithAnchor).toHaveBeenCalledWith({
      limit: 50,
      anchor: "anchor-1",
    });
    expect(page.workouts.map((workout) => workout.uuid)).toEqual(["run-2"]);
    expect(page.deletedUuids).toEqual(["gone-1"]);
    expect(page.newAnchor).toBe("anchor-2");
  });

  it("enables background delivery only through the dedicated methods", async () => {
    const enableBackgroundDelivery = vi.fn(async () => true);
    const disableBackgroundDelivery = vi.fn(async () => true);
    const requestAuthorization = vi.fn(async () => true);
    const adapter = createHealthKitAdapter(
      {
        isHealthDataAvailable: () => true,
        requestAuthorization,
        enableBackgroundDelivery,
        disableBackgroundDelivery,
      },
      allowPrompt,
    );

    expect(await adapter.enableBackgroundDelivery()).toBe(true);
    expect(enableBackgroundDelivery).toHaveBeenCalledWith(
      "HKWorkoutTypeIdentifier",
      1,
    );
    expect(await adapter.disableBackgroundDelivery()).toBe(true);
    expect(requestAuthorization).not.toHaveBeenCalled();
  });
});
