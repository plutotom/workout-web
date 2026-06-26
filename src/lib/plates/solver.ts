// Symmetric per-side plate math. Pure + unit-tested; no app/DB dependencies.
export type Unit = "lb" | "kg";

export interface PlateConfig {
  /** Empty bar weight. */
  bar: number;
  /** Plate denominations, largest first. */
  plates: number[];
}

// V1 assumes a standard commercial gym (locked decision: no inventory setup).
export const STANDARD_PLATES: Record<Unit, PlateConfig> = {
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
};

// Common bar weights offered as quick presets (Olympic, women's, training).
export const BAR_PRESETS: Record<Unit, number[]> = {
  lb: [45, 35, 15],
  kg: [20, 15, 10],
};

/** A denomination loaded `count` times **on each side**. */
export interface PlateCount {
  plate: number;
  count: number;
}

export interface WeightToPlates {
  /** False when the target is below the bar weight. */
  feasible: boolean;
  /** Plates to load on each side, largest first. */
  perSide: PlateCount[];
  /** Actual total achieved: bar + 2 × per-side sum. */
  loadedTotal: number;
  /** How far short of the target (≥ 0). */
  remainder: number;
  /** True when the target is loadable exactly. */
  exact: boolean;
}

const EPS = 1e-6;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Greedily load the largest plates that fit on each side. With unlimited
 * standard plates the greedy result is optimal; any shortfall is reported as
 * `remainder` (e.g. odd weights that the smallest plate can't reach).
 */
export function solveWeightToPlates(
  target: number,
  config: PlateConfig = STANDARD_PLATES.lb,
): WeightToPlates {
  const { bar, plates } = config;

  if (target < bar - EPS) {
    return {
      feasible: false,
      perSide: [],
      loadedTotal: bar,
      remainder: 0,
      exact: false,
    };
  }

  let remainingPerSide = (target - bar) / 2;
  const perSide: PlateCount[] = [];
  for (const plate of plates) {
    const count = Math.floor((remainingPerSide + EPS) / plate);
    if (count > 0) {
      perSide.push({ plate, count });
      remainingPerSide -= count * plate;
    }
  }

  const loadedTotal = platesToWeight(perSide, config);
  const remainder = round2(target - loadedTotal);
  return {
    feasible: true,
    perSide,
    loadedTotal,
    remainder,
    exact: remainder < EPS,
  };
}

/** Total bar weight for a per-side plate selection: bar + 2 × per-side sum. */
export function platesToWeight(
  perSide: PlateCount[],
  config: PlateConfig = STANDARD_PLATES.lb,
): number {
  const perSideSum = perSide.reduce((sum, p) => sum + p.plate * p.count, 0);
  return round2(config.bar + 2 * perSideSum);
}
