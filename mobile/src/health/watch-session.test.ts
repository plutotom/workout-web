import { describe, expect, it } from "vitest";

import {
  parseWatchEvent,
  reduceWatchSessionStatus,
  shouldAutoStartWatchWorkout,
  shouldShowWatchCompanion,
  shouldSkipPhoneHealthExport,
  watchCompanionPresentation,
  watchHealthUuidKey,
  watchLaunchErrorMessage,
  watchRecordedKey,
  watchStartBlockedReason,
} from "./watch-session";

const readyWatch = {
  supported: true,
  paired: true,
  installed: true,
  reachable: true,
};

describe("Watch auto-start gating", () => {
  it("auto-starts only when the setting is on and a Watch app is ready", () => {
    expect(
      shouldAutoStartWatchWorkout({
        autoStartEnabled: true,
        status: readyWatch,
      }),
    ).toBe(true);
    expect(
      shouldAutoStartWatchWorkout({
        autoStartEnabled: false,
        status: readyWatch,
      }),
    ).toBe(false);
    expect(
      shouldAutoStartWatchWorkout({
        autoStartEnabled: true,
        status: { ...readyWatch, paired: false },
      }),
    ).toBe(false);
    expect(
      shouldAutoStartWatchWorkout({
        autoStartEnabled: true,
        status: { ...readyWatch, installed: false },
      }),
    ).toBe(false);
    expect(
      shouldAutoStartWatchWorkout({
        autoStartEnabled: true,
        status: { ...readyWatch, supported: false },
      }),
    ).toBe(false);
    expect(
      shouldAutoStartWatchWorkout({
        autoStartEnabled: true,
        status: readyWatch,
        healthAvailable: false,
      }),
    ).toBe(false);
  });

  it("hides the control without a paired Watch unless a session is already live", () => {
    expect(
      shouldShowWatchCompanion({
        status: { ...readyWatch, supported: false },
        watchStatus: "idle",
      }),
    ).toBe(false);
    expect(
      shouldShowWatchCompanion({
        status: { ...readyWatch, paired: false },
        watchStatus: "idle",
      }),
    ).toBe(false);
    expect(
      shouldShowWatchCompanion({
        status: { ...readyWatch, paired: false },
        watchStatus: "recording",
      }),
    ).toBe(true);
    expect(
      shouldShowWatchCompanion({
        status: readyWatch,
        watchStatus: "idle",
      }),
    ).toBe(true);
  });

  it("uses a compact Start on Apple Watch control when auto-start is off", () => {
    expect(
      watchCompanionPresentation({
        autoStartEnabled: false,
        watchStatus: "idle",
        hasError: false,
      }),
    ).toBe("compact");
    expect(
      watchCompanionPresentation({
        autoStartEnabled: true,
        watchStatus: "idle",
        hasError: false,
      }),
    ).toBe("expanded");
    expect(
      watchCompanionPresentation({
        autoStartEnabled: false,
        watchStatus: "recording",
        hasError: false,
      }),
    ).toBe("expanded");
    expect(
      watchCompanionPresentation({
        autoStartEnabled: false,
        watchStatus: "idle",
        hasError: true,
      }),
    ).toBe("expanded");
  });
});

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

describe("reduceWatchSessionStatus", () => {
  it("keeps ended after a later idle mirror so Discard cannot look live again", () => {
    const ended = parseWatchEvent({
      type: "ended",
      sessionId: "session-1",
      healthUuid: "",
    });
    const idle = parseWatchEvent({
      type: "state",
      sessionId: "session-1",
      status: "idle",
      reachable: true,
    });
    expect(ended && idle).toBeTruthy();
    if (!ended || !idle) return;
    const afterEnd = reduceWatchSessionStatus("recording", ended, "session-1");
    expect(afterEnd).toBe("ended");
    expect(reduceWatchSessionStatus(afterEnd, idle, "session-1")).toBe("ended");
  });

  it("ignores state events from a different session", () => {
    const other = parseWatchEvent({
      type: "state",
      sessionId: "other",
      status: "recording",
      reachable: true,
    });
    expect(other).toBeTruthy();
    if (!other) return;
    expect(reduceWatchSessionStatus("idle", other, "session-1")).toBe("idle");
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
