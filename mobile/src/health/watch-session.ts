export type WatchCompanionStatus = {
  supported: boolean;
  paired: boolean;
  installed: boolean;
  reachable: boolean;
};

export type WatchSessionStatus =
  | "idle"
  | "starting"
  | "recording"
  | "recovering"
  | "recoveryFailed"
  | "saving"
  | "saveFailed"
  | "ended"
  | "disconnected"
  | "reachable";

export type WatchEvent = (
  | {
      type: "state";
      sessionId: string;
      status: WatchSessionStatus;
      reachable: boolean;
    }
  | {
      type: "metrics";
      /** Older Watch builds omit this; the bridge binds them to the active session. */
      sessionId?: string;
      heartRate: number | null;
      activeEnergyKcal: number | null;
      durationSeconds: number;
    }
  | {
      type: "ended";
      sessionId: string;
      healthUuid: string | null;
      /** HealthKit can save successfully without returning a UUID while locked. */
      healthSaved?: boolean;
    }
) & { accountScope?: string; startError?: string };

export function watchHealthUuidKey(sessionId: string) {
  return `watch_health_uuid:${sessionId}`;
}

export function watchRecordedKey(sessionId: string) {
  return `watch_recorded:${sessionId}`;
}

export function shouldSkipPhoneHealthExport(input: {
  watchRecorded: boolean;
  watchHealthUuid: string | null;
}) {
  return input.watchRecorded || Boolean(input.watchHealthUuid);
}

/** Default ON so existing installs keep today's auto-start Watch session. */
export const DEFAULT_AUTO_START_WATCH_WORKOUT = true;

export function shouldAutoStartWatchWorkout(input: {
  autoStartEnabled: boolean;
  status: WatchCompanionStatus;
  healthAvailable?: boolean | null;
}) {
  if (input.healthAvailable === false) return false;
  return (
    input.autoStartEnabled &&
    input.status.supported &&
    input.status.paired &&
    input.status.installed
  );
}

export function shouldShowWatchCompanion(input: {
  status: WatchCompanionStatus;
  watchStatus: WatchSessionStatus;
}) {
  if (!input.status.supported) return false;
  if (
    input.watchStatus === "starting" ||
    input.watchStatus === "recording" ||
    input.watchStatus === "recovering" ||
    input.watchStatus === "recoveryFailed" ||
    input.watchStatus === "saving" ||
    input.watchStatus === "saveFailed" ||
    input.watchStatus === "ended" ||
    input.watchStatus === "disconnected"
  ) {
    return true;
  }
  return input.status.paired;
}

export function watchCompanionPresentation(input: {
  autoStartEnabled: boolean;
  watchStatus: WatchSessionStatus;
  hasError: boolean;
}): "compact" | "expanded" {
  if (input.autoStartEnabled || input.hasError) return "expanded";
  if (input.watchStatus === "idle" || input.watchStatus === "reachable") {
    return "compact";
  }
  return "expanded";
}

/** Keep a finished/discarded Watch session from flipping back to idle. */
export function reduceWatchSessionStatus(
  current: WatchSessionStatus,
  event: WatchEvent,
  sessionId: string,
): WatchSessionStatus {
  if (event.type === "ended" && event.sessionId === sessionId) return "ended";
  if (event.type !== "state") return current;
  if (event.sessionId && event.sessionId !== sessionId) return current;
  if (current === "ended") return current;
  // Reachability describes the connection, not the workout lifecycle.
  if (!event.sessionId) return current;
  if (
    ["recording", "saving", "saveFailed"].includes(current) &&
    ["starting", "recovering"].includes(event.status)
  )
    return current;
  if (
    ["saving", "saveFailed"].includes(current) &&
    event.status === "recording"
  )
    return current;
  return event.status;
}

export function watchStartBlockedReason(status: WatchCompanionStatus) {
  if (!status.supported)
    return "Watch recording is not available in this build.";
  if (!status.paired) return "No paired Apple Watch on this iPhone.";
  if (!status.installed) {
    return "Install Grayed Lift on Apple Watch from the Watch app on iPhone, then try again.";
  }
  return null;
}

export function watchLaunchErrorMessage(raw: unknown) {
  const blocked =
    raw &&
    typeof raw === "object" &&
    "message" in raw &&
    typeof raw.message === "string"
      ? raw.message
      : typeof raw === "string"
        ? raw
        : "";
  const cause =
    blocked
      .split(/→\s*Caused by:\s*/i)
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1) ?? blocked;
  const text = cause.toLowerCase();
  if (text.includes("not installed")) {
    return "Install Grayed Lift on Apple Watch from the Watch app on iPhone, then try again.";
  }
  if (text.includes("authoriz") || text.includes("denied")) {
    return "Allow Grayed Lift to write Apple Health workouts, then try again.";
  }
  if (
    text.includes("unable to launch") ||
    text.includes("no response") ||
    text.includes("concurrentfunctiondefinition")
  ) {
    return "Couldn’t launch Grayed Lift on Apple Watch. Unlock the Watch, raise your wrist, and try Start Watch again.";
  }
  return cause.split("\n")[0]?.trim() || "Couldn’t start Watch.";
}

export function parseWatchEvent(payload: unknown): WatchEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  const scope =
    typeof value.accountScope === "string"
      ? { accountScope: value.accountScope }
      : {};
  const startError =
    typeof value.startError === "string"
      ? { startError: value.startError }
      : {};
  const type = value.type;
  if (type === "state") {
    const status = parseWatchStatus(value.status);
    if (!status) return null;
    return {
      type: "state",
      sessionId: stringValue(value.sessionId),
      status,
      reachable: Boolean(value.reachable),
      ...scope,
      ...startError,
    };
  }
  if (type === "metrics") {
    return {
      type: "metrics",
      ...(stringValue(value.sessionId)
        ? { sessionId: stringValue(value.sessionId) }
        : {}),
      heartRate: finiteNumber(value.heartRate),
      activeEnergyKcal: finiteNumber(value.activeEnergyKcal),
      durationSeconds: finiteNumber(value.durationSeconds) ?? 0,
      ...scope,
      ...startError,
    };
  }
  if (type === "ended") {
    const uuid = stringValue(value.healthUuid);
    return {
      type: "ended",
      sessionId: stringValue(value.sessionId),
      healthUuid: uuid || null,
      ...scope,
      ...startError,
      ...(typeof value.healthSaved === "boolean"
        ? { healthSaved: value.healthSaved }
        : {}),
    };
  }
  return null;
}

function parseWatchStatus(value: unknown): WatchSessionStatus | null {
  if (
    value === "idle" ||
    value === "starting" ||
    value === "recording" ||
    value === "recovering" ||
    value === "recoveryFailed" ||
    value === "saving" ||
    value === "saveFailed" ||
    value === "ended" ||
    value === "disconnected" ||
    value === "reachable"
  ) {
    return value;
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}
