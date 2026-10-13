import { describe, expect, it } from "vitest";

import {
  generalPreferenceBindValues,
  inProgressWorkoutLayout,
  mergeGeneralPreferences,
} from "./preferences";
import type { LocalPreferences } from "./types";

const focusPrefs: LocalPreferences = {
  unit: "lb",
  barWeightLb: 45,
  barWeightKg: 20,
  activeWorkoutMode: "focus",
  restTimerEnabled: true,
  restTimerNotificationsEnabled: true,
  appleHealthImportNotificationsEnabled: false,
};

describe("inProgressWorkoutLayout", () => {
  it("uses the local List/Focus preference for a tracked session", () => {
    expect(inProgressWorkoutLayout(undefined, "focus")).toBe("focus");
    expect(inProgressWorkoutLayout("list", "focus")).toBe("focus");
    expect(inProgressWorkoutLayout("list", "list")).toBe("list");
  });

  it("keeps note workouts on the note editor regardless of List/Focus", () => {
    expect(inProgressWorkoutLayout("note", "focus")).toBe("note");
    expect(inProgressWorkoutLayout("note", "list")).toBe("note");
  });

  it("does not treat a Convex List save as enough to leave Focus", () => {
    // Settings writes Convex immediately and shows that value. The workout
    // still reads SQLite; until that row is List, Focus stays on screen.
    const settingsCloudMode = "list";
    const localMode = "focus";
    expect(settingsCloudMode).toBe("list");
    expect(inProgressWorkoutLayout("list", localMode)).toBe("focus");
  });
});

describe("mergeGeneralPreferences", () => {
  it("switches active workout view without dropping other local prefs", () => {
    expect(
      mergeGeneralPreferences(focusPrefs, { activeWorkoutMode: "list" }),
    ).toMatchObject({
      unit: "lb",
      activeWorkoutMode: "list",
      restTimerEnabled: true,
    });
  });
});

describe("generalPreferenceBindValues", () => {
  it("writes List into the SQLite bind order the live workout reads", () => {
    const bound = generalPreferenceBindValues(
      mergeGeneralPreferences(focusPrefs, { activeWorkoutMode: "list" }),
      1_700_000_000_000,
    );
    expect(bound[3]).toBe("list");
    expect(bound[0]).toBe("lb");
    expect(bound[4]).toBe(1);
  });
});
