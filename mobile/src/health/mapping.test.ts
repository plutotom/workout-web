import { describe, expect, it } from "vitest";

import {
  distanceMetersFromQuantity,
  durationSecondsFromSample,
  energyKcalFromQuantity,
  formatHealthDistance,
  formatHealthEnergy,
  healthSyncIdentifier,
  isAppAuthoredHealthWorkout,
  normalizeHealthWorkout,
  resolveActivityMeta,
} from "./mapping";

describe("resolveActivityMeta", () => {
  it("maps triathlon and transition HealthKit codes", () => {
    expect(resolveActivityMeta(82)).toMatchObject({
      type: "swimBikeRun",
      name: "Triathlon",
    });
    expect(resolveActivityMeta("swimBikeRun")).toMatchObject({
      name: "Triathlon",
    });
    expect(resolveActivityMeta(83)).toMatchObject({
      type: "transition",
      name: "Transition",
    });
  });

  it("maps running, walking, cycling, swimming, and strength", () => {
    expect(resolveActivityMeta("running")).toMatchObject({
      name: "Run",
      symbol: "figure.run",
    });
    expect(resolveActivityMeta(37)).toMatchObject({ type: "running" });
    expect(resolveActivityMeta("walking").symbol).toBe("figure.walk");
    expect(resolveActivityMeta("cycling").symbol).toBe("bicycle");
    expect(resolveActivityMeta("swimming").symbol).toBe("figure.pool.swim");
    expect(resolveActivityMeta("traditionalStrengthTraining")).toMatchObject({
      name: "Strength",
      symbol: "dumbbell",
    });
  });

  it("falls back to a generic activity", () => {
    expect(resolveActivityMeta("pickleballUnderwater")).toMatchObject({
      type: "other",
      name: "Workout",
      symbol: "figure.mixed.cardio",
    });
  });
});

describe("unit conversions", () => {
  it("converts duration units to seconds", () => {
    expect(
      durationSecondsFromSample({
        duration: { quantity: 45, unit: "min" },
        startDate: 0,
        endDate: 0,
      }),
    ).toBe(2700);
    expect(
      durationSecondsFromSample({
        duration: 1800,
        startDate: 1_000,
        endDate: 1_000,
      }),
    ).toBe(1800);
  });

  it("stores distance in meters", () => {
    expect(distanceMetersFromQuantity({ quantity: 5, unit: "km" })).toBe(5000);
    expect(distanceMetersFromQuantity({ quantity: 1, unit: "mi" })).toBeCloseTo(
      1609.344,
    );
    expect(distanceMetersFromQuantity({ quantity: 400, unit: "m" })).toBe(400);
  });

  it("stores energy in kilocalories", () => {
    expect(energyKcalFromQuantity({ quantity: 320, unit: "kcal" })).toBe(320);
    expect(energyKcalFromQuantity({ quantity: 4184, unit: "kJ" })).toBeCloseTo(
      1000,
    );
  });

  it("formats distance in the user's unit", () => {
    expect(formatHealthDistance(5000, "kg")).toBe("5.00 km");
    expect(formatHealthDistance(1609.344, "lb")).toBe("1.00 mi");
    expect(formatHealthEnergy(419.4)).toBe("419 kcal");
  });
});

describe("normalizeHealthWorkout", () => {
  it("builds an app-owned summary from a HealthKit sample", () => {
    const workout = normalizeHealthWorkout({
      uuid: "ABC-123",
      workoutActivityType: "running",
      startDate: "2026-08-22T12:00:00.000Z",
      endDate: "2026-08-22T12:32:00.000Z",
      duration: { quantity: 1920, unit: "s" },
      totalDistance: { quantity: 5.2, unit: "km" },
      totalEnergyBurned: { quantity: 410, unit: "kcal" },
      sourceRevision: {
        source: { name: "Apple Watch", bundleIdentifier: "com.apple.health" },
      },
    });
    expect(workout).toMatchObject({
      uuid: "ABC-123",
      activityType: "running",
      activityName: "Run",
      symbolName: "figure.run",
      durationSeconds: 1920,
      distanceMeters: 5200,
      energyKcal: 410,
      sourceName: "Apple Watch",
      sourceBundleId: "com.apple.health",
      syncIdentifier: null,
    });
  });

  it("names a swim-bike-run workout Triathlon and lists typed legs", () => {
    const start = Date.parse("2026-08-22T07:00:00.000Z");
    const swimEnd = start + 32 * 60 * 1000;
    const t1End = swimEnd + 3 * 60 * 1000;
    const bikeEnd = t1End + 60 * 60 * 1000;
    const t2End = bikeEnd + 3 * 60 * 1000;
    const runEnd = t2End + 82 * 60 * 1000;
    const workout = normalizeHealthWorkout({
      uuid: "tri-1",
      workoutActivityType: 82,
      startDate: start,
      endDate: runEnd,
      duration: { quantity: 3, unit: "hr" },
      totalDistance: { quantity: 34.2, unit: "km" },
      totalEnergyBurned: { quantity: 1480, unit: "kcal" },
      sourceName: "Apple Watch",
      activities: [
        {
          uuid: "swim",
          startDate: start,
          endDate: swimEnd,
          duration: 32 * 60,
          workoutConfiguration: { activityType: 46 },
          totalDistance: { quantity: 1500, unit: "m" },
        },
        {
          uuid: "t1",
          startDate: swimEnd,
          endDate: t1End,
          duration: 3 * 60,
          workoutActivityType: 83,
        },
        {
          uuid: "bike",
          startDate: t1End,
          endDate: bikeEnd,
          duration: 3600,
          workoutConfiguration: { activityType: 13 },
          totalDistance: { quantity: 25, unit: "km" },
        },
        {
          uuid: "t2",
          startDate: bikeEnd,
          endDate: t2End,
          duration: 3 * 60,
          workoutActivityType: 83,
        },
        {
          uuid: "run",
          startDate: t2End,
          endDate: runEnd,
          duration: 82 * 60,
          workoutConfiguration: { activityType: 37 },
          totalDistance: { quantity: 7.7, unit: "km" },
        },
      ],
    });
    expect(workout).toMatchObject({
      activityType: "swimBikeRun",
      activityName: "Triathlon",
      durationSeconds: 10800,
      distanceMeters: 34200,
    });
    expect(workout?.segments).toEqual([
      expect.objectContaining({
        activityType: "swimming",
        activityName: "Swim",
        durationSeconds: 1920,
        distanceMeters: 1500,
      }),
      expect.objectContaining({
        activityType: "transition",
        activityName: "Transition",
      }),
      expect.objectContaining({
        activityType: "cycling",
        activityName: "Bike",
        distanceMeters: 25000,
      }),
      expect.objectContaining({
        activityType: "transition",
        activityName: "Transition",
      }),
      expect.objectContaining({
        activityType: "running",
        activityName: "Run",
        distanceMeters: 7700,
      }),
    ]);
  });

  it("reads typed legs from the native WorkoutActivityLegs metadata JSON", () => {
    const start = Date.parse("2026-08-22T07:00:00.000Z");
    const workout = normalizeHealthWorkout({
      uuid: "tri-meta",
      workoutActivityType: "swimBikeRun",
      startDate: start,
      endDate: start + 90 * 60 * 1000,
      metadata: {
        WorkoutActivityLegs: JSON.stringify([
          {
            startDate: start,
            endDate: start + 30 * 60 * 1000,
            duration: 1800,
            workoutActivityType: 37,
          },
          {
            startDate: start + 30 * 60 * 1000,
            endDate: start + 90 * 60 * 1000,
            duration: 3600,
            workoutActivityType: 13,
            totalDistance: { quantity: 20, unit: "km" },
          },
        ]),
      },
      activities: [
        {
          uuid: "untyped-1",
          startDate: start,
          endDate: start + 30 * 60 * 1000,
          duration: 1800,
        },
      ],
    });
    expect(workout?.activityName).toBe("Multisport");
    expect(workout?.segments?.map((segment) => segment.activityName)).toEqual([
      "Run",
      "Bike",
    ]);
  });

  it("keeps untyped nested activities as splits instead of inventing sports", () => {
    const start = Date.parse("2026-08-22T07:00:00.000Z");
    const workout = normalizeHealthWorkout({
      uuid: "tri-untyped",
      workoutActivityType: 82,
      startDate: start,
      endDate: start + 60 * 60 * 1000,
      activities: [
        {
          uuid: "a",
          startDate: start,
          endDate: start + 20 * 60 * 1000,
          duration: 1200,
        },
        {
          uuid: "b",
          startDate: start + 20 * 60 * 1000,
          endDate: start + 40 * 60 * 1000,
          duration: 1200,
        },
        {
          uuid: "c",
          startDate: start + 40 * 60 * 1000,
          endDate: start + 60 * 60 * 1000,
          duration: 1200,
        },
      ],
    });
    expect(workout?.activityName).toBe("Triathlon");
    expect(workout?.segments?.map((segment) => segment.activityName)).toEqual([
      "Split",
      "Split",
      "Split",
    ]);
  });

  it("rejects samples without a UUID", () => {
    expect(
      normalizeHealthWorkout({
        uuid: "  ",
        workoutActivityType: "running",
        startDate: Date.now(),
        endDate: Date.now() + 1000,
      }),
    ).toBeNull();
  });

  it("carries HealthKit sync metadata used to skip exported workouts", () => {
    const workout = normalizeHealthWorkout({
      uuid: "exported-1",
      workoutActivityType: 50,
      startDate: Date.parse("2026-08-22T12:00:00.000Z"),
      endDate: Date.parse("2026-08-22T13:00:00.000Z"),
      metadata: {
        HKMetadataKeySyncIdentifier: healthSyncIdentifier("session-1"),
        HKMetadataKeySyncVersion: 1,
      },
    });
    expect(workout?.syncIdentifier).toBe(
      "com.isaiahproctor.workout.local:session:session-1",
    );
  });
});

describe("app-authored Health workout filtering", () => {
  it("recognizes workouts this app saved", () => {
    expect(
      isAppAuthoredHealthWorkout(
        { sourceBundleId: "com.isaiahproctor.workout.local" },
        "com.isaiahproctor.workout.local",
      ),
    ).toBe(true);
    expect(
      isAppAuthoredHealthWorkout(
        { sourceBundleId: "com.apple.health" },
        "com.isaiahproctor.workout.local",
      ),
    ).toBe(false);
    expect(
      isAppAuthoredHealthWorkout(
        { sourceBundleId: "com.isaiahproctor.workout.local.watchkitapp" },
        "com.isaiahproctor.workout.local",
      ),
    ).toBe(true);
  });

  it("recognizes workouts by HealthKit sync identifier when the source bundle is missing", () => {
    expect(
      isAppAuthoredHealthWorkout(
        {
          sourceBundleId: "com.apple.health",
          syncIdentifier: "com.isaiahproctor.workout.local:session:abc",
        },
        "com.isaiahproctor.workout.local",
      ),
    ).toBe(true);
    expect(
      isAppAuthoredHealthWorkout(
        {
          sourceBundleId: "com.apple.health",
          syncIdentifier: "com.other.app:session:abc",
        },
        "com.isaiahproctor.workout.local",
      ),
    ).toBe(false);
  });
});
