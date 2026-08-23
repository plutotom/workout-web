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
