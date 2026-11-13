import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EXERCISE_PICKER_STYLES,
  exercisePickerStyleAllowed,
  readExercisePickerStyle,
  subscribeExercisePickerStyle,
  writeExercisePickerStyle,
} from "./exercise-picker-style";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubGlobal("__DEV__", true);
  writeExercisePickerStyle("current");
});
afterEach(() => {
  writeExercisePickerStyle("current");
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("exercise picker style switcher", () => {
  it("defaults to the shipping current picker", () => {
    expect(readExercisePickerStyle()).toBe("current");
  });

  it("notifies subscribers when the style changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeExercisePickerStyle(listener);
    writeExercisePickerStyle("palette");
    expect(readExercisePickerStyle()).toBe("palette");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeExercisePickerStyle("grid");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown ids instead of leaving the picker on a missing variant", () => {
    writeExercisePickerStyle("not-a-style" as never);
    expect(readExercisePickerStyle()).toBe("current");
  });

  it("covers every prototype id the settings card lists", () => {
    expect(EXERCISE_PICKER_STYLES.map((style) => style.id)).toEqual([
      "current",
      "recents",
      "sectioned",
      "drilldown",
      "palette",
      "sheet",
      "grid",
    ]);
  });
});

describe("production isolation", () => {
  it.each(["production", "test", "", "staging"])(
    "fails closed in %s environments when __DEV__ is unset",
    (environment) => {
      vi.unstubAllGlobals();
      vi.stubEnv("NODE_ENV", environment);
      expect(exercisePickerStyleAllowed()).toBe(false);
      expect(readExercisePickerStyle()).toBe("current");
      writeExercisePickerStyle("palette");
      expect(readExercisePickerStyle()).toBe("current");
    },
  );

  it("ignores writes in a native release even if a style was previously selected", () => {
    vi.stubGlobal("__DEV__", false);
    expect(exercisePickerStyleAllowed()).toBe(false);
    writeExercisePickerStyle("sheet");
    expect(readExercisePickerStyle()).toBe("current");
  });
});
