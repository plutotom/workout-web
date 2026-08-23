import { describe, expect, it } from "vitest";

import {
  activityMatchesSelectedType,
  AUTO_IMPORT_NOTIFY_WINDOW_MS,
  autoImportNotificationCopy,
  decideAutoImport,
  DEFAULT_AUTO_IMPORT_TYPES,
  parseHealthAutoImportPrefs,
  shouldNotifyAutoImport,
  workoutPassesAutoImportFilter,
} from "./auto-import";
import { APP_BUNDLE_ID } from "./mapping";
import type { HealthAutoImportPrefs, HealthWorkoutSummary } from "./types";

const now = Date.parse("2026-08-22T18:00:00.000Z");

function workout(
  overrides: Partial<HealthWorkoutSummary> &
    Pick<HealthWorkoutSummary, "uuid" | "activityType">,
): HealthWorkoutSummary {
  return {
    activityName: "Run",
    symbolName: "figure.run",
    startedAt: now - 30 * 60 * 1000,
    endedAt: now - 5 * 60 * 1000,
    durationSeconds: 25 * 60,
    distanceMeters: 5000,
    energyKcal: 400,
    sourceName: "Apple Watch",
    sourceBundleId: "com.apple.health.watch",
    ...overrides,
  };
}

const enabledRun: HealthAutoImportPrefs = {
  enabled: true,
  importAllTypes: false,
  types: ["running"],
};

describe("parseHealthAutoImportPrefs", () => {
  it("defaults to cardio types when nothing is stored", () => {
    expect(
      parseHealthAutoImportPrefs({
        enabled: null,
        importAll: null,
        types: null,
      }),
    ).toEqual({
      enabled: false,
      importAllTypes: false,
      types: [...DEFAULT_AUTO_IMPORT_TYPES],
    });
  });

  it("keeps an explicit empty type list", () => {
    expect(
      parseHealthAutoImportPrefs({
        enabled: "1",
        importAll: "0",
        types: "[]",
      }).types,
    ).toEqual([]);
  });
});

describe("workoutPassesAutoImportFilter", () => {
  it("requires the toggle and a matching type", () => {
    expect(
      workoutPassesAutoImportFilter(
        { activityType: "running" },
        { enabled: false, importAllTypes: false, types: ["running"] },
      ),
    ).toBe(false);
    expect(
      workoutPassesAutoImportFilter({ activityType: "running" }, enabledRun),
    ).toBe(true);
    expect(
      workoutPassesAutoImportFilter({ activityType: "cycling" }, enabledRun),
    ).toBe(false);
  });

  it("imports every type when Import all is on", () => {
    expect(
      workoutPassesAutoImportFilter(
        { activityType: "pickleball" },
        { enabled: true, importAllTypes: true, types: ["running"] },
      ),
    ).toBe(true);
  });

  it("treats functional and core strength as the Strength chip", () => {
    expect(
      activityMatchesSelectedType(
        "functionalStrengthTraining",
        "traditionalStrengthTraining",
      ),
    ).toBe(true);
    expect(
      workoutPassesAutoImportFilter(
        { activityType: "coreTraining" },
        {
          enabled: true,
          importAllTypes: false,
          types: ["traditionalStrengthTraining"],
        },
      ),
    ).toBe(true);
  });
});

describe("decideAutoImport", () => {
  it("imports a selected recent workout once", () => {
    expect(
      decideAutoImport({
        workout: workout({ uuid: "run-1", activityType: "running" }),
        prefs: enabledRun,
        imported: new Set(),
        ignored: new Set(),
        overlapCandidates: [],
        appBundleId: APP_BUNDLE_ID,
        now,
      }),
    ).toEqual({ action: "import" });
  });

  it("skips filtered, duplicate, ignored, old, and app-authored workouts", () => {
    const base = {
      prefs: enabledRun,
      imported: new Set<string>(),
      ignored: new Set<string>(),
      overlapCandidates: [],
      appBundleId: APP_BUNDLE_ID,
      now,
    };
    expect(
      decideAutoImport({
        ...base,
        workout: workout({ uuid: "ride-1", activityType: "cycling" }),
      }),
    ).toEqual({ action: "skip", reason: "filter" });
    expect(
      decideAutoImport({
        ...base,
        imported: new Set(["run-1"]),
        workout: workout({ uuid: "run-1", activityType: "running" }),
      }),
    ).toEqual({ action: "skip", reason: "duplicate" });
    expect(
      decideAutoImport({
        ...base,
        ignored: new Set(["run-1"]),
        workout: workout({ uuid: "run-1", activityType: "running" }),
      }),
    ).toEqual({ action: "skip", reason: "ignored" });
    expect(
      decideAutoImport({
        ...base,
        workout: workout({
          uuid: "old-run",
          activityType: "running",
          startedAt: now - 100 * 24 * 60 * 60 * 1000,
          endedAt: now - 100 * 24 * 60 * 60 * 1000,
        }),
      }),
    ).toEqual({ action: "skip", reason: "too_old" });
    expect(
      decideAutoImport({
        ...base,
        workout: workout({
          uuid: "ours",
          activityType: "running",
          sourceBundleId: APP_BUNDLE_ID,
        }),
      }),
    ).toEqual({ action: "skip", reason: "app_authored" });
  });

  it("does not auto-import a strength workout that overlaps a detailed session", () => {
    const decision = decideAutoImport({
      workout: workout({
        uuid: "strength-1",
        activityType: "traditionalStrengthTraining",
        startedAt: now - 60 * 60 * 1000,
        endedAt: now - 10 * 60 * 1000,
      }),
      prefs: {
        enabled: true,
        importAllTypes: true,
        types: [],
      },
      imported: new Set(),
      ignored: new Set(),
      overlapCandidates: [
        {
          startedAt: now - 60 * 60 * 1000,
          completedAt: now - 5 * 60 * 1000,
        },
      ],
      appBundleId: APP_BUNDLE_ID,
      now,
    });
    expect(decision).toEqual({ action: "skip", reason: "overlap" });
  });
});

describe("shouldNotifyAutoImport", () => {
  it("notifies only recently finished workouts", () => {
    expect(shouldNotifyAutoImport({ endedAt: now - 10 * 60 * 1000 }, now)).toBe(
      true,
    );
    expect(
      shouldNotifyAutoImport(
        { endedAt: now - AUTO_IMPORT_NOTIFY_WINDOW_MS - 1 },
        now,
      ),
    ).toBe(false);
  });

  it("names a single import and batches several", () => {
    expect(
      autoImportNotificationCopy([
        { activityName: "Run", durationSeconds: 1800 },
      ]),
    ).toEqual({
      title: "Run imported",
      body: "30 min from Apple Health.",
    });
    expect(
      autoImportNotificationCopy([
        { activityName: "Run", durationSeconds: 1800 },
        { activityName: "Ride", durationSeconds: 3600 },
      ]),
    ).toEqual({
      title: "Workouts imported",
      body: "2 workouts from Apple Health.",
    });
  });
});
