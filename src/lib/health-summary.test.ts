import { describe, expect, it } from "vitest";

import {
  formatHealthDistance,
  formatHealthEnergy,
  formatHealthHistoryLine,
  formatHealthSportLine,
  multiSportDisplayName,
  parseHealthSegments,
  parseHealthSegmentsJson,
  serializeHealthSegments,
  type HealthWorkoutSegment,
} from "./health-summary";

describe("formatHealthDistance", () => {
  it("formats miles for lb users and km for kg users", () => {
    expect(formatHealthDistance(5000, "kg")).toBe("5.00 km");
    expect(formatHealthDistance(1609.344, "lb")).toBe("1.00 mi");
  });
});

describe("formatHealthHistoryLine", () => {
  it("returns null for tracked sessions", () => {
    expect(
      formatHealthHistoryLine({
        sessionKind: "tracked",
        sourceName: "Apple Watch",
      }),
    ).toBeNull();
  });

  it("summarizes a Health import without empty lifting copy", () => {
    expect(
      formatHealthHistoryLine({
        sessionKind: "health_summary",
        sourceName: "Apple Watch",
        distanceMeters: 5000,
        energyKcal: 410,
        unit: "kg",
      }),
    ).toBe("Health · Apple Watch · 5.00 km · 410 kcal");
  });

  it("includes triathlon legs on the history line", () => {
    expect(
      formatHealthHistoryLine({
        sessionKind: "health_summary",
        sourceName: "Apple Watch",
        distanceMeters: 34200,
        energyKcal: 1480,
        unit: "kg",
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
            activityType: "transition",
            activityName: "Transition",
            startedAt: 2,
            endedAt: 3,
            durationSeconds: 180,
            distanceMeters: null,
            energyKcal: null,
          },
          {
            activityType: "cycling",
            activityName: "Bike",
            startedAt: 3,
            endedAt: 4,
            durationSeconds: 3600,
            distanceMeters: 25000,
            energyKcal: 720,
          },
          {
            activityType: "running",
            activityName: "Run",
            startedAt: 4,
            endedAt: 5,
            durationSeconds: 4920,
            distanceMeters: 7700,
            energyKcal: 480,
          },
        ],
      }),
    ).toBe("Health · Apple Watch · Swim · Bike · Run · 34.2 km · 1480 kcal");
  });

  it("falls back to Apple Health when the source is missing", () => {
    expect(
      formatHealthHistoryLine({
        sessionKind: "health_summary",
        energyKcal: 180,
      }),
    ).toBe("Apple Health · 180 kcal");
  });
});

describe("formatHealthEnergy", () => {
  it("rounds kilocalories", () => {
    expect(formatHealthEnergy(419.4)).toBe("419 kcal");
    expect(formatHealthEnergy(0)).toBeNull();
  });
});

const triathlonLegs: HealthWorkoutSegment[] = [
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
    activityType: "transition",
    activityName: "Transition",
    startedAt: 2,
    endedAt: 3,
    durationSeconds: 180,
    distanceMeters: null,
    energyKcal: null,
  },
  {
    activityType: "cycling",
    activityName: "Bike",
    startedAt: 3,
    endedAt: 4,
    durationSeconds: 3600,
    distanceMeters: 25000,
    energyKcal: 720,
  },
  {
    activityType: "running",
    activityName: "Run",
    startedAt: 4,
    endedAt: 5,
    durationSeconds: 4920,
    distanceMeters: 7700,
    energyKcal: 480,
  },
];

describe("multiSportDisplayName", () => {
  it("names swim-bike-run Triathlon and run-bike-run Duathlon", () => {
    expect(multiSportDisplayName("swimBikeRun", triathlonLegs)).toBe(
      "Triathlon",
    );
    expect(
      multiSportDisplayName("swimBikeRun", [
        {
          activityType: "running",
          activityName: "Run",
          startedAt: 1,
          endedAt: 2,
          durationSeconds: 1,
          distanceMeters: null,
          energyKcal: null,
        },
        {
          activityType: "cycling",
          activityName: "Bike",
          startedAt: 2,
          endedAt: 3,
          durationSeconds: 1,
          distanceMeters: null,
          energyKcal: null,
        },
        {
          activityType: "running",
          activityName: "Run",
          startedAt: 3,
          endedAt: 4,
          durationSeconds: 1,
          distanceMeters: null,
          energyKcal: null,
        },
      ]),
    ).toBe("Duathlon");
    expect(multiSportDisplayName("swimBikeRun", [])).toBe("Triathlon");
    expect(multiSportDisplayName("running", triathlonLegs)).toBeNull();
  });
});

describe("health segment JSON", () => {
  it("round-trips valid segments and drops junk", () => {
    const json = serializeHealthSegments(triathlonLegs);
    expect(parseHealthSegmentsJson(json)).toEqual(triathlonLegs);
    expect(parseHealthSegments([{ activityType: "running" }])).toEqual([]);
    expect(serializeHealthSegments([])).toBeNull();
  });
});

describe("formatHealthSportLine", () => {
  it("skips transitions", () => {
    expect(formatHealthSportLine(triathlonLegs)).toBe("Swim · Bike · Run");
  });
});
