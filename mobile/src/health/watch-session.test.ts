import { describe, expect, it } from "vitest";

import {
  parseWatchEvent,
  shouldSkipPhoneHealthExport,
  watchHealthUuidKey,
  watchLaunchErrorMessage,
  watchRecordedKey,
  watchStartBlockedReason,
} from "./watch-session";

describe("shouldSkipPhoneHealthExport", () => {
  it("skips when Watch recorded or already saved a Health UUID", () => {
    expect(
      shouldSkipPhoneHealthExport({
        watchRecorded: true,
        watchHealthUuid: null,
      }),
    ).toBe(true);
    expect(
      shouldSkipPhoneHealthExport({
        watchRecorded: false,
        watchHealthUuid: "hk-1",
      }),
    ).toBe(true);
    expect(
      shouldSkipPhoneHealthExport({
        watchRecorded: false,
        watchHealthUuid: null,
      }),
    ).toBe(false);
  });
});

describe("parseWatchEvent", () => {
  it("parses mirrored metrics and a successful Watch save", () => {
    expect(
      parseWatchEvent({
        type: "metrics",
        heartRate: 148,
        activeEnergyKcal: 22.4,
        durationSeconds: 90,
      }),
    ).toEqual({
      type: "metrics",
      heartRate: 148,
      activeEnergyKcal: 22.4,
      durationSeconds: 90,
    });
    expect(
      parseWatchEvent({
        type: "ended",
        sessionId: "session-1",
        healthUuid: "ABC",
      }),
    ).toEqual({
      type: "ended",
      sessionId: "session-1",
      healthUuid: "ABC",
    });
  });

  it("treats an empty Health UUID as a discarded Watch session", () => {
    expect(
      parseWatchEvent({
        type: "ended",
        sessionId: "session-1",
        healthUuid: "",
      }),
    ).toMatchObject({ healthUuid: null });
  });

  it("ignores unknown payloads", () => {
    expect(parseWatchEvent(null)).toBeNull();
    expect(parseWatchEvent({ type: "nope" })).toBeNull();
  });
});

describe("watch launch copy", () => {
  it("asks to install the companion when the Watch app is missing", () => {
    expect(
      watchStartBlockedReason({
        supported: true,
        paired: true,
        installed: false,
        reachable: false,
      }),
    ).toMatch(/Install Grayed Lift on Apple Watch/);
    expect(
      watchStartBlockedReason({
        supported: true,
        paired: true,
        installed: true,
        reachable: true,
      }),
    ).toBeNull();
  });

  it("strips Expo’s ConcurrentFunction wrapper from HealthKit launch failures", () => {
    expect(
      watchLaunchErrorMessage(
        new Error(
          "Call to function 'WatchBridge.startWatchWorkout' has been rejected.\n→ Caused by: Unexpected error: Unable to launch Watch app (at ExpoModulesCore/ConcurrentFunctionDefinition.swift:90)",
        ),
      ),
    ).toMatch(/Unlock the Watch/);
    expect(
      watchLaunchErrorMessage(
        new Error(
          "Call to function 'WatchBridge.startWatchWorkout' has been rejected.\n→ Caused by: Couldn’t launch Grayed Lift on Apple Watch. Unlock the Watch, raise your wrist, and try Start Watch again.",
        ),
      ),
    ).toMatch(/Unlock the Watch/);
  });
});

describe("watch local keys", () => {
  it("scopes persisted Watch state to the app session", () => {
    expect(watchRecordedKey("abc")).toBe("watch_recorded:abc");
    expect(watchHealthUuidKey("abc")).toBe("watch_health_uuid:abc");
  });
});
