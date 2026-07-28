import { describe, expect, it } from "vitest";

import { convertWeight, uniqueName } from "./portableTemplates";

describe("convertWeight", () => {
  it("leaves weights alone when the units match", () => {
    expect(convertWeight(185, "lb", "lb")).toBe(185);
    expect(convertWeight(100, "kg", "kg")).toBe(100);
  });

  it("converts kg to lb", () => {
    expect(convertWeight(100, "kg", "lb")).toBe(220);
    expect(convertWeight(60, "kg", "lb")).toBe(132);
  });

  it("converts lb to kg", () => {
    expect(convertWeight(225, "lb", "kg")).toBe(102);
    expect(convertWeight(45, "lb", "kg")).toBe(20);
  });

  it("keeps 0 as 0 — it means 'no preset', not 'zero weight'", () => {
    expect(convertWeight(0, "kg", "lb")).toBe(0);
    expect(convertWeight(0, "lb", "kg")).toBe(0);
  });

  it("round-trips close to the original", () => {
    const original = 185;
    const there = convertWeight(original, "lb", "kg");
    expect(Math.abs(convertWeight(there, "kg", "lb") - original)).toBeLessThan(
      2,
    );
  });
});

describe("uniqueName", () => {
  it("keeps a free name as-is", () => {
    expect(uniqueName("Push Day", new Set())).toBe("Push Day");
  });

  it("suffixes a collision rather than overwriting", () => {
    expect(uniqueName("Push Day", new Set(["push day"]))).toBe("Push Day (2)");
  });

  it("keeps counting past the first collision", () => {
    const taken = new Set(["push day", "push day (2)"]);
    expect(uniqueName("Push Day", taken)).toBe("Push Day (3)");
  });

  it("matches case-insensitively", () => {
    expect(uniqueName("PUSH DAY", new Set(["push day"]))).toBe("PUSH DAY (2)");
  });

  it("reserves each name it hands out, so one import can't self-collide", () => {
    const taken = new Set<string>();
    expect(uniqueName("Legs", taken)).toBe("Legs");
    expect(uniqueName("Legs", taken)).toBe("Legs (2)");
    expect(uniqueName("Legs", taken)).toBe("Legs (3)");
  });

  it("falls back to Untitled for a blank name", () => {
    expect(uniqueName("   ", new Set())).toBe("Untitled");
  });

  it("trims before comparing", () => {
    expect(uniqueName("  Push Day  ", new Set(["push day"]))).toBe(
      "Push Day (2)",
    );
  });
});
