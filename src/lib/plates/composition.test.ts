import { afterEach, describe, expect, it } from "vitest";

import {
  changePlateCount,
  clearPlateCompositionMemory,
  createPlateSession,
  hasLoadedPlates,
  perSideFromPlateCounts,
  plateCompositionId,
  plateCountsFromPerSide,
  plateModeOptions,
  recallPlateComposition,
  reducePlateSession,
  rememberPlateComposition,
  seedPlateCounts,
  sessionTotal,
  snapshotPlateComposition,
} from "./composition";
import { STANDARD_PLATES } from "./solver";

const lbPlates = STANDARD_PLATES.lb.plates;

afterEach(() => {
  clearPlateCompositionMemory();
});

describe("plate composition identity", () => {
  it("isolates unrelated lifts that reuse a set id", () => {
    expect(plateCompositionId("bench-press", "set-1")).toBe(
      "bench-press:set-1",
    );
    expect(plateCompositionId("squat", "set-1")).toBe("squat:set-1");
  });
});

describe("seedPlateCounts", () => {
  it("opens 185 lb as a 45 bar plus 45 and 25 per side", () => {
    expect(
      seedPlateCounts({
        target: 185,
        unit: "lb",
        bar: 45,
        countBar: true,
        plates: lbPlates,
      }),
    ).toEqual({ 45: 1, 25: 1 });
  });

  it("restores a non-greedy load when it still matches the target", () => {
    expect(
      seedPlateCounts({
        target: 135,
        unit: "lb",
        bar: 45,
        countBar: true,
        plates: lbPlates,
        stored: {
          counts: { 35: 1, 10: 1 },
          bar: 45,
          countBar: true,
          unit: "lb",
        },
      }),
    ).toEqual({ 35: 1, 10: 1 });
  });

  it("re-solves when the stored plates belong to a different weight", () => {
    expect(
      seedPlateCounts({
        target: 225,
        unit: "lb",
        bar: 45,
        countBar: true,
        plates: lbPlates,
        stored: {
          counts: { 35: 1, 10: 1 },
          bar: 45,
          countBar: true,
          unit: "lb",
        },
      }),
    ).toEqual({ 45: 2 });
  });
});

describe("plate session editing", () => {
  it("lets either tab remove and replace plates while keeping the same bar", () => {
    let state = createPlateSession({
      target: 185,
      unit: "lb",
      barWeight: 45,
    });
    expect(state.counts).toEqual({ 45: 1, 25: 1 });
    expect(state.bar).toBe(45);
    expect(sessionTotal(state, lbPlates)).toBe(185);
    expect(plateModeOptions(hasLoadedPlates(state.counts))[1]?.label).toBe(
      "Edit bar",
    );

    state = reducePlateSession(state, {
      type: "changeCount",
      plate: 25,
      delta: -1,
    });
    expect(state.counts).toEqual({ 45: 1 });
    expect(state.draft).toBe("135");
    expect(sessionTotal(state, lbPlates)).toBe(135);

    state = reducePlateSession(state, { type: "setMode", mode: "toWeight" });
    state = reducePlateSession(state, {
      type: "changeCount",
      plate: 10,
      delta: 1,
    });
    expect(state.mode).toBe("toWeight");
    expect(state.counts).toEqual({ 45: 1, 10: 1 });
    expect(state.draft).toBe("155");

    state = reducePlateSession(state, { type: "setMode", mode: "toPlates" });
    expect(state.counts).toEqual({ 45: 1, 10: 1 });
    expect(sessionTotal(state, lbPlates)).toBe(155);
  });

  it("re-solves from the target field without losing bar setup", () => {
    let state = createPlateSession({
      target: 185,
      unit: "lb",
      barWeight: 45,
    });
    state = reducePlateSession(state, { type: "setTargetDraft", value: "225" });
    expect(state.counts).toEqual({ 45: 2 });
    expect(state.draft).toBe("225");
    expect(state.bar).toBe(45);
  });

  it("keeps actual plates when the bar preset changes", () => {
    let state = createPlateSession({
      target: 185,
      unit: "lb",
      barWeight: 45,
    });
    state = reducePlateSession(state, { type: "selectBar", bar: 35 });
    expect(state.counts).toEqual({ 45: 1, 25: 1 });
    expect(sessionTotal(state, lbPlates)).toBe(175);
    expect(state.draft).toBe("175");
  });
});

describe("plate composition memory", () => {
  it("reopens the same lift with the edited plates and leaves other lifts alone", () => {
    let bench = createPlateSession({
      target: 185,
      unit: "lb",
      barWeight: 45,
    });
    bench = reducePlateSession(bench, {
      type: "changeCount",
      plate: 25,
      delta: -1,
    });
    bench = reducePlateSession(bench, {
      type: "changeCount",
      plate: 10,
      delta: 1,
    });
    bench = reducePlateSession(bench, {
      type: "changeCount",
      plate: 10,
      delta: 1,
    });
    bench = reducePlateSession(bench, {
      type: "changeCount",
      plate: 5,
      delta: 1,
    });
    expect(sessionTotal(bench, lbPlates)).toBe(185);
    expect(bench.counts).toEqual({ 45: 1, 10: 2, 5: 1 });

    rememberPlateComposition(
      plateCompositionId("bench-press", "set-1"),
      snapshotPlateComposition(bench),
    );

    const squat = createPlateSession({
      target: 185,
      unit: "lb",
      barWeight: 45,
      stored: recallPlateComposition(plateCompositionId("squat", "set-1")),
    });
    expect(squat.counts).toEqual({ 45: 1, 25: 1 });

    const reopened = createPlateSession({
      target: 185,
      unit: "lb",
      barWeight: 45,
      stored: recallPlateComposition(
        plateCompositionId("bench-press", "set-1"),
      ),
    });
    expect(reopened.counts).toEqual({ 45: 1, 10: 2, 5: 1 });
    expect(reopened.bar).toBe(45);
    expect(sessionTotal(reopened, lbPlates)).toBe(185);
  });

  it("does not restore unapplied edits whose total no longer matches the set", () => {
    let state = createPlateSession({
      target: 185,
      unit: "lb",
      barWeight: 45,
    });
    state = reducePlateSession(state, {
      type: "changeCount",
      plate: 25,
      delta: -1,
    });
    rememberPlateComposition(
      plateCompositionId("bench-press", "set-1"),
      snapshotPlateComposition(state),
    );

    const reopened = createPlateSession({
      target: 185,
      unit: "lb",
      barWeight: 45,
      stored: recallPlateComposition(
        plateCompositionId("bench-press", "set-1"),
      ),
    });
    expect(reopened.counts).toEqual({ 45: 1, 25: 1 });
  });
});

describe("plate count helpers", () => {
  it("round-trips greedy plates and drops zeroed denominations", () => {
    const counts = plateCountsFromPerSide([
      { plate: 45, count: 1 },
      { plate: 25, count: 1 },
    ]);
    expect(perSideFromPlateCounts(counts, lbPlates)).toEqual([
      { plate: 45, count: 1 },
      { plate: 25, count: 1 },
    ]);
    expect(changePlateCount(counts, 25, -1)).toEqual({ 45: 1 });
  });
});
