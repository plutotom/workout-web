import { Platform } from "react-native";

import {
  HEALTH_QUERY_PAGE_SIZE,
  isAppAuthoredHealthWorkout,
  normalizeHealthWorkout,
} from "./mapping";
import type {
  HealthAdapter,
  HealthAuthorizationState,
  HealthWorkoutSample,
  HealthWorkoutSummary,
} from "./types";

const WORKOUT_READ_TYPE = "HKWorkoutTypeIdentifier";
const APP_BUNDLE_ID = "com.isaiahproctor.workout.local";

type NativeHealthKit = {
  isHealthDataAvailable?: () => boolean;
  isHealthDataAvailableAsync?: () => Promise<boolean>;
  requestAuthorization?: (options: {
    toRead?: string[];
    toShare?: string[];
  }) => Promise<unknown>;
  getRequestStatusForAuthorization?: (options: {
    toRead?: string[];
    toShare?: string[];
  }) => Promise<number | string>;
  queryWorkoutSamples?: (options: {
    limit?: number;
    ascending?: boolean;
    filter?: {
      date?: { startDate: Date; endDate: Date };
    };
  }) => Promise<HealthWorkoutSample[]>;
};

function loadNative(): NativeHealthKit | null {
  if (Platform.OS !== "ios") return null;
  try {
    // Native-only. Metro still resolves the package; runtime APIs no-op off iOS.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@kingstinct/react-native-healthkit") as NativeHealthKit;
  } catch {
    return null;
  }
}

async function authorizationState(
  native: NativeHealthKit,
): Promise<HealthAuthorizationState> {
  if (!(await nativeAvailable(native))) return "unavailable";
  try {
    if (typeof native.getRequestStatusForAuthorization === "function") {
      const status = await native.getRequestStatusForAuthorization({
        toRead: [WORKOUT_READ_TYPE],
      });
      return mapRequestStatus(status);
    }
  } catch {
    return "limited";
  }
  return "not_requested";
}

async function nativeAvailable(native: NativeHealthKit) {
  try {
    if (typeof native.isHealthDataAvailableAsync === "function") {
      return await native.isHealthDataAvailableAsync();
    }
    if (typeof native.isHealthDataAvailable === "function") {
      return native.isHealthDataAvailable();
    }
  } catch {
    return false;
  }
  return true;
}

function mapRequestStatus(status: number | string | undefined) {
  if (status === 1 || status === "shouldRequest") return "not_requested";
  if (status === 2 || status === "unnecessary") return "connected";
  return "limited";
}

async function queryPages(
  native: NativeHealthKit,
  since: number,
  until: number,
): Promise<HealthWorkoutSummary[]> {
  if (typeof native.queryWorkoutSamples !== "function") return [];
  const collected = new Map<string, HealthWorkoutSummary>();
  let windowEnd = until;

  for (let page = 0; page < 20; page++) {
    const samples = await native.queryWorkoutSamples({
      limit: HEALTH_QUERY_PAGE_SIZE,
      ascending: false,
      filter: {
        date: {
          startDate: new Date(since),
          endDate: new Date(windowEnd),
        },
      },
    });
    if (!Array.isArray(samples) || samples.length === 0) break;

    let oldestStart = windowEnd;
    for (const sample of samples) {
      const workout = normalizeHealthWorkout(sample);
      if (!workout) continue;
      if (workout.startedAt < since) continue;
      if (isAppAuthoredHealthWorkout(workout, APP_BUNDLE_ID)) continue;
      collected.set(workout.uuid, workout);
      oldestStart = Math.min(oldestStart, workout.startedAt);
    }

    if (samples.length < HEALTH_QUERY_PAGE_SIZE) break;
    if (oldestStart >= windowEnd) break;
    windowEnd = oldestStart - 1;
    if (windowEnd < since) break;
  }

  return [...collected.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function createHealthKitAdapter(): HealthAdapter {
  const native = loadNative();

  return {
    async isAvailable() {
      if (!native) return false;
      return nativeAvailable(native);
    },
    async getAuthorizationState(): Promise<HealthAuthorizationState> {
      if (!native) return "unavailable";
      return authorizationState(native);
    },
    async requestReadAccess(): Promise<HealthAuthorizationState> {
      if (!native || !(await nativeAvailable(native))) return "unavailable";
      if (typeof native.requestAuthorization !== "function") return "limited";
      await native.requestAuthorization({ toRead: [WORKOUT_READ_TYPE] });
      return authorizationState(native);
    },
    async queryRecentWorkouts({ since, until }) {
      if (!native || !(await nativeAvailable(native))) return [];
      if (typeof native.requestAuthorization === "function") {
        await native.requestAuthorization({ toRead: [WORKOUT_READ_TYPE] });
      }
      return queryPages(native, since, until ?? Date.now());
    },
  };
}

export { HEALTH_LOOKBACK_MS } from "./mapping";
