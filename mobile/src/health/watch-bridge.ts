import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

import { healthSyncIdentifier } from "@/health/mapping";
import {
  parseWatchEvent,
  watchLaunchErrorMessage,
  type WatchCompanionStatus,
  type WatchEvent,
} from "@/health/watch-session";

type WatchBridgeNative = {
  getStatus: () => WatchCompanionStatus;
  startWatchWorkout: (
    sessionId: string,
    startedAt: number,
    syncIdentifier: string,
  ) => Promise<void>;
  endWatchWorkout: () => Promise<void>;
  discardWatchWorkout: () => Promise<void>;
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
  if (!native) {
    throw new Error("Watch recording is only available on iPhone.");
  }
  try {
    await native.startWatchWorkout(
      input.sessionId,
      input.startedAt,
      healthSyncIdentifier(input.sessionId),
    );
  } catch (caught) {
    throw new Error(watchLaunchErrorMessage(caught));
  }
}

export async function endWatchWorkout() {
  if (!native) return;
  await native.endWatchWorkout();
}

export async function discardWatchWorkout() {
  if (!native) return;
  await native.discardWatchWorkout();
}

export function subscribeWatchEvents(onEvent: (event: WatchEvent) => void) {
  if (!native) return () => {};
  const sub = native.addListener("onWatchEvent", (payload) => {
    const event = parseWatchEvent(payload);
    if (event) onEvent(event);
  });
  return () => sub.remove();
}
