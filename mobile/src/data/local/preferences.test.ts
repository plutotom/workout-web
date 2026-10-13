import { describe, expect, it } from "vitest";

import {
  generalPreferenceBindValues,
  inProgressWorkoutLayout,
  mergeEchoPendingPatch,
  mergeGeneralPreferences,
  normalizeCloudGeneralPreferences,
  parseEchoPendingPatch,
  resolveBootstrappedGeneralPreferences,
  serializeEchoPendingPatch,
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

const localGeneral = {
  unit: "lb" as const,
  barWeightLb: 45,
  barWeightKg: 20,
  activeWorkoutMode: "list" as const,
  restTimerEnabled: true,
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

describe("resolveBootstrappedGeneralPreferences", () => {
  it("adopts the full cloud blob when nothing is waiting for an echo", () => {
    const cloud = {
      ...localGeneral,
      activeWorkoutMode: "focus" as const,
      unit: "kg" as const,
    };
    expect(
      resolveBootstrappedGeneralPreferences({
        pending: null,
        local: localGeneral,
        cloud,
      }),
    ).toEqual({ next: cloud, remainingPending: null });
  });

  it("keeps a local List write when bootstrap still carries Convex Focus", () => {
    const resolved = resolveBootstrappedGeneralPreferences({
      pending: { activeWorkoutMode: "list" },
      local: localGeneral,
      cloud: { ...localGeneral, activeWorkoutMode: "focus" },
    });
    expect(resolved.next.activeWorkoutMode).toBe("list");
    expect(resolved.remainingPending).toEqual({ activeWorkoutMode: "list" });
  });

  it("clears echo-pending once Convex catches up to the local write", () => {
    const resolved = resolveBootstrappedGeneralPreferences({
      pending: { activeWorkoutMode: "list" },
      local: localGeneral,
      cloud: localGeneral,
    });
    expect(resolved.next.activeWorkoutMode).toBe("list");
    expect(resolved.remainingPending).toBeNull();
  });

  it("still adopts a web unit change while a List echo is in flight", () => {
    const resolved = resolveBootstrappedGeneralPreferences({
      pending: { activeWorkoutMode: "list" },
      local: localGeneral,
      cloud: {
        ...localGeneral,
        unit: "kg",
        activeWorkoutMode: "focus",
      },
    });
    expect(resolved.next).toEqual({
      ...localGeneral,
      unit: "kg",
      activeWorkoutMode: "list",
    });
    expect(resolved.remainingPending).toEqual({ activeWorkoutMode: "list" });
  });

  it("keeps a local bar write when Convex still has the old default", () => {
    const local = { ...localGeneral, barWeightLb: 35 };
    const resolved = resolveBootstrappedGeneralPreferences({
      pending: { barWeightLb: 35 },
      local,
      cloud: localGeneral,
    });
    expect(resolved.next.barWeightLb).toBe(35);
    expect(resolved.remainingPending).toEqual({ barWeightLb: 35 });
  });
});

describe("echo pending serialization", () => {
  it("round-trips a List patch and ignores unknown keys", () => {
    const serialized = serializeEchoPendingPatch(
      mergeEchoPendingPatch(null, { activeWorkoutMode: "list" }),
    );
    expect(serialized).toBe('{"activeWorkoutMode":"list"}');
    expect(parseEchoPendingPatch(serialized)).toEqual({
      activeWorkoutMode: "list",
    });
    expect(
      parseEchoPendingPatch('{"activeWorkoutMode":"list","extra":true}'),
    ).toEqual({ activeWorkoutMode: "list" });
    expect(parseEchoPendingPatch("not-json")).toBeNull();
    expect(parseEchoPendingPatch("{}")).toBeNull();
  });
});

describe("normalizeCloudGeneralPreferences", () => {
  it("fills the standard bar when Convex left the field unset", () => {
    expect(
      normalizeCloudGeneralPreferences({
        unit: "lb",
        barWeightLb: null,
        barWeightKg: null,
        activeWorkoutMode: "list",
        restTimerEnabled: true,
      }),
    ).toEqual(localGeneral);
  });
});
