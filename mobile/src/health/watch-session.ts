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
  | "ended"
  | "disconnected"
  | "reachable";

export type WatchEvent =
  | {
      type: "state";
      sessionId: string;
      status: WatchSessionStatus;
      reachable: boolean;
    }
  | {
      type: "metrics";
      heartRate: number | null;
      activeEnergyKcal: number | null;
      durationSeconds: number;
    }
  | {
      type: "ended";
      sessionId: string;
      healthUuid: string | null;
    };

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

export function watchStartBlockedReason(status: WatchCompanionStatus) {
  if (!status.supported || !status.paired) return null;
  if (!status.installed) {
    return "Install Workout on Apple Watch from the Watch app on iPhone, then try again.";
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
    return "Install Workout on Apple Watch from the Watch app on iPhone, then try again.";
  }
  if (text.includes("authoriz") || text.includes("denied")) {
    return "Allow Workout to write Apple Health workouts, then try again.";
  }
  if (
    text.includes("unable to launch") ||
    text.includes("no response") ||
    text.includes("concurrentfunctiondefinition")
  ) {
    return "Couldn’t launch Workout on Apple Watch. Unlock the Watch, raise your wrist, and try Start Watch again.";
  }
  return cause.split("\n")[0]?.trim() || "Couldn’t start Watch.";
}

export function parseWatchEvent(payload: unknown): WatchEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  const type = value.type;
  if (type === "state") {
    const status = parseWatchStatus(value.status);
    if (!status) return null;
    return {
      type: "state",
      sessionId: stringValue(value.sessionId),
      status,
      reachable: Boolean(value.reachable),
    };
  }
  if (type === "metrics") {
    return {
      type: "metrics",
      heartRate: finiteNumber(value.heartRate),
      activeEnergyKcal: finiteNumber(value.activeEnergyKcal),
      durationSeconds: finiteNumber(value.durationSeconds) ?? 0,
    };
  }
  if (type === "ended") {
    const uuid = stringValue(value.healthUuid);
    return {
      type: "ended",
      sessionId: stringValue(value.sessionId),
      healthUuid: uuid || null,
    };
  }
  return null;
}

function parseWatchStatus(value: unknown): WatchSessionStatus | null {
  if (
    value === "idle" ||
    value === "starting" ||
    value === "recording" ||
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
