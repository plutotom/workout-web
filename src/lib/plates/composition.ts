import {
  platesToWeight,
  solveWeightToPlates,
  STANDARD_PLATES,
  type PlateConfig,
  type PlateCount,
  type Unit,
} from "./solver";

export type PlateCounts = Record<number, number>;

export type CalculatorMode = "toPlates" | "toWeight";

export type StoredPlateComposition = {
  counts: PlateCounts;
  bar: number;
  countBar: boolean;
  unit: Unit;
};

export type PlateSessionState = {
  mode: CalculatorMode;
  draft: string;
  countBar: boolean;
  bar: number;
  barDraft: string;
  counts: PlateCounts;
  unit: Unit;
};

export type PlateSessionInit = {
  target: number;
  unit: Unit;
  barWeight: number;
  countBar?: boolean;
  stored?: StoredPlateComposition | null;
};

export type PlateSessionAction =
  | { type: "setMode"; mode: CalculatorMode }
  | { type: "setTargetDraft"; value: string }
  | { type: "changeCount"; plate: number; delta: number }
  | { type: "clearPlates" }
  | { type: "setCountBar"; countBar: boolean }
  | { type: "selectBar"; bar: number }
  | { type: "setBarDraft"; value: string };

const EPS = 1e-6;
const memory = new Map<string, StoredPlateComposition>();

export function plateCompositionId(
  exerciseSlug: string,
  setId: string,
): string {
  return `${exerciseSlug}:${setId}`;
}

export function sanitizeDecimal(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...decimals] = cleaned.split(".");
  return decimals.length ? `${whole}.${decimals.join("")}` : whole;
}

export function plateCountsFromPerSide(perSide: PlateCount[]): PlateCounts {
  const counts: PlateCounts = {};
  for (const { plate, count } of perSide) {
    if (count > 0) counts[plate] = count;
  }
  return counts;
}

export function perSideFromPlateCounts(
  counts: PlateCounts,
  plates: number[],
): PlateCount[] {
  return plates
    .filter((plate) => (counts[plate] ?? 0) > 0)
    .map((plate) => ({ plate, count: counts[plate] ?? 0 }));
}

export function changePlateCount(
  counts: PlateCounts,
  plate: number,
  delta: number,
): PlateCounts {
  const next = Math.max(0, (counts[plate] ?? 0) + delta);
  if (next === 0) {
    const rest = { ...counts };
    delete rest[plate];
    return rest;
  }
  return { ...counts, [plate]: next };
}

export function sessionConfig(
  state: Pick<PlateSessionState, "bar" | "countBar">,
  plates: number[],
): PlateConfig {
  return { bar: state.countBar ? state.bar : 0, plates };
}

export function sessionTotal(
  state: Pick<PlateSessionState, "counts" | "bar" | "countBar">,
  plates: number[],
): number {
  return platesToWeight(
    perSideFromPlateCounts(state.counts, plates),
    sessionConfig(state, plates),
  );
}

export function hasLoadedPlates(counts: PlateCounts): boolean {
  return Object.values(counts).some((count) => count > 0);
}

function draftForTotal(total: number): string {
  return total > 0 ? String(total) : "";
}

function cloneStored(stored: StoredPlateComposition): StoredPlateComposition {
  return { ...stored, counts: { ...stored.counts } };
}

export function rememberPlateComposition(
  id: string,
  stored: StoredPlateComposition,
) {
  memory.set(id, cloneStored(stored));
}

export function recallPlateComposition(
  id: string,
): StoredPlateComposition | null {
  const stored = memory.get(id);
  return stored ? cloneStored(stored) : null;
}

export function clearPlateCompositionMemory() {
  memory.clear();
}

export function snapshotPlateComposition(
  state: PlateSessionState,
): StoredPlateComposition {
  return {
    counts: { ...state.counts },
    bar: state.bar,
    countBar: state.countBar,
    unit: state.unit,
  };
}

export function storedCompositionMatchesTarget(
  stored: StoredPlateComposition,
  target: number,
  plates: number[],
): boolean {
  const total = platesToWeight(perSideFromPlateCounts(stored.counts, plates), {
    bar: stored.countBar ? stored.bar : 0,
    plates,
  });
  return Math.abs(total - target) < EPS;
}

export function seedPlateCounts(args: {
  target: number;
  unit: Unit;
  bar: number;
  countBar: boolean;
  plates: number[];
  stored?: StoredPlateComposition | null;
}): PlateCounts {
  const { target, unit, bar, countBar, plates, stored } = args;
  if (
    stored &&
    stored.unit === unit &&
    stored.countBar === countBar &&
    stored.bar === bar &&
    storedCompositionMatchesTarget(stored, target, plates)
  ) {
    return { ...stored.counts };
  }
  const solved = solveWeightToPlates(target, {
    bar: countBar ? bar : 0,
    plates,
  });
  return solved.feasible ? plateCountsFromPerSide(solved.perSide) : {};
}

export function createPlateSession({
  target,
  unit,
  barWeight,
  countBar: initialCountBar = true,
  stored,
}: PlateSessionInit): PlateSessionState {
  const plates = STANDARD_PLATES[unit].plates;
  if (
    stored &&
    stored.unit === unit &&
    storedCompositionMatchesTarget(stored, target, plates)
  ) {
    return {
      mode: "toPlates",
      draft: target > 0 ? String(target) : "",
      countBar: stored.countBar,
      bar: stored.bar,
      barDraft: String(stored.bar),
      counts: { ...stored.counts },
      unit,
    };
  }

  const countBar = initialCountBar;
  const bar = barWeight;
  return {
    mode: "toPlates",
    draft: target > 0 ? String(target) : "",
    countBar,
    bar,
    barDraft: String(bar),
    counts: seedPlateCounts({
      target,
      unit,
      bar: countBar ? bar : 0,
      countBar,
      plates,
      stored: null,
    }),
    unit,
  };
}

export function reducePlateSession(
  state: PlateSessionState,
  action: PlateSessionAction,
): PlateSessionState {
  const plates = STANDARD_PLATES[state.unit].plates;
  switch (action.type) {
    case "setMode":
      return { ...state, mode: action.mode };
    case "setTargetDraft": {
      const draft = sanitizeDecimal(action.value);
      if (draft.trim() === "") return { ...state, draft };
      const numeric = Number(draft);
      if (!Number.isFinite(numeric)) return { ...state, draft };
      const solved = solveWeightToPlates(numeric, sessionConfig(state, plates));
      return {
        ...state,
        draft,
        counts: solved.feasible ? plateCountsFromPerSide(solved.perSide) : {},
      };
    }
    case "changeCount": {
      const counts = changePlateCount(state.counts, action.plate, action.delta);
      return {
        ...state,
        counts,
        draft: draftForTotal(sessionTotal({ ...state, counts }, plates)),
      };
    }
    case "clearPlates": {
      const counts = {};
      return {
        ...state,
        counts,
        draft: draftForTotal(sessionTotal({ ...state, counts }, plates)),
      };
    }
    case "setCountBar": {
      const next = { ...state, countBar: action.countBar };
      return { ...next, draft: draftForTotal(sessionTotal(next, plates)) };
    }
    case "selectBar": {
      const next = { ...state, bar: action.bar, barDraft: String(action.bar) };
      return { ...next, draft: draftForTotal(sessionTotal(next, plates)) };
    }
    case "setBarDraft": {
      const barDraft = sanitizeDecimal(action.value);
      const next = {
        ...state,
        barDraft,
        bar: barDraft === "" ? state.bar : Number(barDraft),
      };
      return { ...next, draft: draftForTotal(sessionTotal(next, plates)) };
    }
  }
}

export function plateModeOptions(hasExistingLoad: boolean) {
  return [
    {
      value: "toPlates" as const,
      label: "Load a weight",
      hint: "Weight → plates",
    },
    {
      value: "toWeight" as const,
      label: hasExistingLoad ? "Edit bar" : "Build a bar",
      hint: "Plates → weight",
    },
  ];
}

/** Validate persisted/cache or backup input before using it in a calculator. */
export function parseStoredPlateComposition(
  value: unknown,
): StoredPlateComposition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    (row.unit !== "lb" && row.unit !== "kg") ||
    typeof row.countBar !== "boolean" ||
    typeof row.bar !== "number" ||
    !Number.isFinite(row.bar) ||
    row.bar < 0 ||
    !row.counts ||
    typeof row.counts !== "object" ||
    Array.isArray(row.counts)
  )
    return null;
  const plates = STANDARD_PLATES[row.unit].plates;
  const counts: PlateCounts = {};
  for (const [plate, count] of Object.entries(row.counts)) {
    if (
      !plates.includes(Number(plate)) ||
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0
    )
      return null;
    counts[Number(plate)] = count;
  }
  return { unit: row.unit, countBar: row.countBar, bar: row.bar, counts };
}
