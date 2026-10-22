import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

import { healthSyncIdentifier } from "@/health/mapping";
import {
  parseWatchEvent,
  reduceWatchSessionStatus,
  watchLaunchErrorMessage,
  type WatchCompanionStatus,
  type WatchEvent,
  type WatchSessionStatus,
} from "@/health/watch-session";

type WatchBridgeNative = {
  getStatus: () => WatchCompanionStatus;
  // Optional so a JS bundle remains compatible with the installed 0.3.1 binary.
  getSessionEvents?: () => unknown[];
  requestWatchStatus?: () => void;
  startWatchWorkout: (
    sessionId: string,
    startedAt: number,
    syncIdentifier: string,
  ) => Promise<void>;
  endWatchWorkout: () => Promise<void>;
  discardWatchWorkout: () => Promise<void>;
  endWatchSession?: (sessionId: string) => Promise<void>;
  discardWatchSession?: (sessionId: string) => Promise<void>;
  addListener: (
    event: "onWatchEvent",
    listener: (payload: Record<string, unknown>) => void,
  ) => { remove: () => void };
};

const native =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<WatchBridgeNative>("WatchBridge")
    : null;
const idleStatus: WatchCompanionStatus = {
  supported: false,
  paired: false,
  installed: false,
  reachable: false,
};

export type WatchSessionSnapshot = {
  status: WatchSessionStatus;
  recorded: boolean;
  heartRate: number | null;
  energyKcal: number | null;
  healthUuid: string | null;
  healthSaved: boolean;
};
type CachedSession = WatchSessionSnapshot & { events: WatchEvent[] };
const sessions = new Map<string, CachedSession>();
const listeners = new Set<(event: WatchEvent) => void>();
let listening = false;
let restored = false;
let activeSessionId = "";

function remember(event: WatchEvent): WatchEvent {
  // Old Watch binaries send unscoped metrics immediately after a scoped state.
  const sessionId =
    event.type === "metrics"
      ? event.sessionId || activeSessionId
      : event.sessionId;
  if (!sessionId) return event;
  const current = sessions.get(sessionId) ?? {
    status: "idle",
    recorded: false,
    heartRate: null,
    energyKcal: null,
    healthUuid: null,
    healthSaved: false,
    events: [],
  };
  if (event.type === "metrics") {
    event = { ...event, sessionId };
    if (current.status === "ended") return event;
    current.heartRate = event.heartRate;
    current.energyKcal = event.activeEnergyKcal;
  } else {
    current.status = reduceWatchSessionStatus(current.status, event, sessionId);
    if (
      event.type === "state" &&
      ["recording", "saving", "saveFailed"].includes(event.status)
    )
      current.recorded = true;
    if (event.type === "ended") {
      current.healthUuid = event.healthUuid || current.healthUuid;
      current.healthSaved =
        current.healthSaved ||
        Boolean(event.healthSaved) ||
        Boolean(current.healthUuid);
      if (current.healthSaved) current.recorded = true;
      event = {
        ...event,
        healthUuid: current.healthUuid,
        ...(current.healthSaved ? { healthSaved: true } : {}),
      };
      if (activeSessionId === sessionId) activeSessionId = "";
    }
    if (
      event.type === "state" &&
      ["starting", "recording", "recovering", "saving", "saveFailed"].includes(
        event.status,
      )
    )
      activeSessionId = sessionId;
    // Cache reduced state so late start/reconnect events cannot rewind it.
    if (event.type === "state") event = { ...event, status: current.status };
  }
  current.events = [
    ...current.events.filter((previous) => previous.type !== event.type),
    event,
  ];
  sessions.set(sessionId, current);
  if (sessions.size > 16) sessions.delete(sessions.keys().next().value!);
  return event;
}

function publish(event: WatchEvent) {
  const scoped = remember(event);
  for (const listener of listeners) listener(scoped);
}

function connect() {
  if (!native || listening) return;
  listening = true;
  native.addListener("onWatchEvent", (payload) => {
    const event = parseWatchEvent(payload);
    if (event) publish(event);
  });
}

function restore() {
  connect();
  if (restored) return;
  restored = true;
  try {
    for (const payload of native?.getSessionEvents?.() ?? []) {
      const event = parseWatchEvent(payload);
      if (event) remember(event);
    }
  } catch {
    // Keep memory if an older/unavailable native bridge cannot replay.
  }
}

export function getWatchSessionSnapshot(
  sessionId: string,
): WatchSessionSnapshot {
  restore();
  const state = sessions.get(sessionId);
  return {
    status: state?.status ?? "idle",
    recorded: state?.recorded ?? false,
    heartRate: state?.heartRate ?? null,
    energyKcal: state?.energyKcal ?? null,
    healthUuid: state?.healthUuid ?? null,
    healthSaved: state?.healthSaved ?? false,
  };
}

/** Replay native state, then ask the Watch for current state without starting it. */
export function refreshWatchSession() {
  restored = false;
  restore();
  const events = [...sessions.values()].flatMap((session) => session.events);
  for (const event of events) for (const listener of listeners) listener(event);
  try {
    native?.requestWatchStatus?.();
  } catch {
    /* Watch may be unavailable. */
  }
}

export function getWatchCompanionStatus(): WatchCompanionStatus {
  try {
    return native?.getStatus() ?? idleStatus;
  } catch {
    return idleStatus;
  }
}

export async function startWatchWorkout(input: {
  sessionId: string;
  startedAt: number;
}) {
  if (!native) throw new Error("Watch recording is only available on iPhone.");
  const current = getWatchSessionSnapshot(input.sessionId).status;
  if (
    [
      "starting",
      "recording",
      "recovering",
      "saving",
      "saveFailed",
      "ended",
    ].includes(current)
  )
    return;
  publish({
    type: "state",
    sessionId: input.sessionId,
    status: "starting",
    reachable: getWatchCompanionStatus().reachable,
  });
  try {
    await native.startWatchWorkout(
      input.sessionId,
      input.startedAt,
      healthSyncIdentifier(input.sessionId),
    );
  } catch (caught) {
    // A launch timeout can arrive after the Watch confirms recording.
    if (
      ["recording", "recovering", "saving", "saveFailed", "ended"].includes(
        getWatchSessionSnapshot(input.sessionId).status,
      )
    )
      return;
    publish({
      type: "state",
      sessionId: input.sessionId,
      status: "idle",
      reachable: getWatchCompanionStatus().reachable,
    });
    throw new Error(watchLaunchErrorMessage(caught));
  }
}

export async function endWatchWorkout(sessionId?: string) {
  if (sessionId && native?.endWatchSession)
    await native.endWatchSession(sessionId);
  else await native?.endWatchWorkout();
}

export async function discardWatchWorkout(sessionId?: string) {
  if (sessionId && native?.discardWatchSession)
    await native.discardWatchSession(sessionId);
  else await native?.discardWatchWorkout();
}

export function subscribeWatchEvents(onEvent: (event: WatchEvent) => void) {
  restore();
  listeners.add(onEvent);
  for (const session of sessions.values())
    for (const event of session.events) onEvent(event);
  return () => {
    listeners.delete(onEvent);
  };
}
