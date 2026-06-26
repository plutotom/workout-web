import { describe, expect, it } from "vitest";

import {
  platesToWeight,
  solveWeightToPlates,
  STANDARD_PLATES,
  type PlateCount,
} from "./solver";

const lb = STANDARD_PLATES.lb;
const kg = STANDARD_PLATES.kg;

describe("solveWeightToPlates (lb)", () => {
  it("loads 225 as two 45s per side", () => {
    const r = solveWeightToPlates(225, lb);
    expect(r.exact).toBe(true);
    expect(r.loadedTotal).toBe(225);
    expect(r.perSide).toEqual([{ plate: 45, count: 2 }]);
  });

  it("loads 135 as one 45 per side", () => {
    const r = solveWeightToPlates(135, lb);
    expect(r.exact).toBe(true);
    expect(r.perSide).toEqual([{ plate: 45, count: 1 }]);
  });

  it("returns no plates for an empty bar", () => {
    const r = solveWeightToPlates(45, lb);
    expect(r.feasible).toBe(true);
    expect(r.exact).toBe(true);
    expect(r.perSide).toEqual([]);
  });

  it("uses 25 + 2.5 per side for 100", () => {
    const r = solveWeightToPlates(100, lb);
    expect(r.exact).toBe(true);
    expect(r.perSide).toEqual([
      { plate: 25, count: 1 },
      { plate: 2.5, count: 1 },
    ]);
  });

  it("reports the closest load and remainder for 137", () => {
    const r = solveWeightToPlates(137, lb);
    expect(r.exact).toBe(false);
    expect(r.loadedTotal).toBe(135);
    expect(r.remainder).toBe(2);
  });

  it("is infeasible below the bar", () => {
    const r = solveWeightToPlates(30, lb);
    expect(r.feasible).toBe(false);
    expect(r.perSide).toEqual([]);
  });

  it("loads dumbbell weight with no bar", () => {
    const r = solveWeightToPlates(50, { bar: 0, plates: lb.plates });
    expect(r.exact).toBe(true);
    expect(r.loadedTotal).toBe(50);
    expect(r.perSide).toEqual([{ plate: 25, count: 1 }]);
  });
});

describe("solveWeightToPlates (kg)", () => {
  it("loads 100 as 25 + 15 per side", () => {
    const r = solveWeightToPlates(100, kg);
    expect(r.exact).toBe(true);
    expect(r.perSide).toEqual([
      { plate: 25, count: 1 },
      { plate: 15, count: 1 },
    ]);
  });
});

describe("platesToWeight", () => {
  it("totals two 45s per side on a 45 bar to 225", () => {
    const perSide: PlateCount[] = [{ plate: 45, count: 2 }];
    expect(platesToWeight(perSide, lb)).toBe(225);
  });

  it("round-trips with the solver", () => {
    const r = solveWeightToPlates(185, lb);
    expect(platesToWeight(r.perSide, lb)).toBe(r.loadedTotal);
  });
});
