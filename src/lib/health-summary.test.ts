import { describe, expect, it } from "vitest";

import {
  formatHealthDistance,
  formatHealthEnergy,
  formatHealthHistoryLine,
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
