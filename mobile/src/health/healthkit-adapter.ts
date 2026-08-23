import { Platform } from "react-native";

import {
  APP_BUNDLE_ID,
  HEALTH_EXPORT_ACTIVITY_CODE,
  HEALTH_QUERY_PAGE_SIZE,
  healthSyncIdentifier,
  isAppAuthoredHealthWorkout,
  normalizeHealthWorkout,
} from "./mapping";
import type {
  HealthAdapter,
  HealthAnchoredWorkoutPage,
  HealthAuthorizationState,
  HealthTrackedWorkoutInput,
  HealthWorkoutSample,
  HealthWorkoutSummary,
} from "./types";

const WORKOUT_TYPE = "HKWorkoutTypeIdentifier";

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
  queryWorkoutSamplesWithAnchor?: (options: {
    limit: number;
    anchor?: string;
  }) => Promise<{
    workouts?: unknown[];
    deletedSamples?: Array<{ uuid?: string }>;
    newAnchor?: string;
  }>;
  saveWorkoutSample?: (
    workoutActivityType: number | string,
    quantities: readonly unknown[],
    startDate: Date,
    endDate: Date,
    totals?: { distance?: number; energyBurned?: number },
    metadata?: Record<string, string | number | boolean>,
  ) => Promise<unknown>;
  enableBackgroundDelivery?: (
    typeIdentifier: string,
    updateFrequency: number,
  ) => Promise<boolean>;
  disableBackgroundDelivery?: (typeIdentifier: string) => Promise<boolean>;
  subscribeToChanges?: (
    identifier: string,
    callback: (args: {
      typeIdentifier?: string;
      errorMessage?: string;
    }) => void,
  ) => { remove: () => boolean | void };
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

async function readAuthorizationState(
  native: NativeHealthKit,
  bundleAllowsHealthPrompt: () => Promise<boolean>,
): Promise<HealthAuthorizationState> {
  if (!(await nativeAvailable(native, bundleAllowsHealthPrompt))) {
    return "unavailable";
  }
  try {
    if (typeof native.getRequestStatusForAuthorization === "function") {
      const status = await native.getRequestStatusForAuthorization({
        toRead: [WORKOUT_TYPE],
      });
      return mapRequestStatus(status);
    }
  } catch {
    // Unknown / failed status is not "already connected". Treat as not
    // requested so the settings screen does not query (or prompt) on open.
    return "not_requested";
  }
  return "not_requested";
}

async function writeAuthorizationState(
  native: NativeHealthKit,
  bundleAllowsHealthPrompt: () => Promise<boolean>,
): Promise<HealthAuthorizationState> {
  if (!(await nativeAvailable(native, bundleAllowsHealthPrompt))) {
    return "unavailable";
  }
  try {
    if (typeof native.getRequestStatusForAuthorization === "function") {
      const status = await native.getRequestStatusForAuthorization({
        toShare: [WORKOUT_TYPE],
      });
      return mapRequestStatus(status);
    }
  } catch {
    return "not_requested";
  }
  return "not_requested";
}

async function nativeAvailable(
  native: NativeHealthKit,
  bundleAllowsHealthPrompt: () => Promise<boolean>,
) {
  try {
    if (!(await bundleAllowsHealthPrompt())) return false;
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

export function mapRequestStatus(status: number | string | undefined) {
  if (status === 1 || status === "shouldRequest") return "not_requested";
  if (status === 2 || status === "unnecessary") return "connected";
  // 0 / "unknown" — do not treat as authorized.
  return "not_requested";
}

type HealthKitAdapterOptions = {
  /**
   * Test override. Do not use a filesystem Info.plist probe here: expo-file-system
   * denies write (and `File.bytes()` requires write) on the read-only app bundle,
   * which falsely reports Health as unavailable on device.
   */
  bundleAllowsHealthPrompt?: () => Promise<boolean>;
};

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

function sampleFromAnchorWorkout(value: unknown): HealthWorkoutSample | null {
  if (!value || typeof value !== "object") return null;
  const record = value as HealthWorkoutSample & {
    toJSON?: (key?: string) => HealthWorkoutSample;
  };
  if (typeof record.uuid === "string" && record.uuid.trim()) return record;
  try {
    const json = record.toJSON?.();
    if (json && typeof json.uuid === "string" && json.uuid.trim()) return json;
  } catch {
    // Nitro proxies can throw once the native object is gone.
  }
  return null;
}

async function queryAnchoredPage(
  native: NativeHealthKit,
  anchor: string | null,
  limit: number,
): Promise<HealthAnchoredWorkoutPage> {
  if (typeof native.queryWorkoutSamplesWithAnchor !== "function") {
    return { workouts: [], deletedUuids: [], newAnchor: anchor };
  }
  const page = await native.queryWorkoutSamplesWithAnchor({
    limit,
    ...(anchor ? { anchor } : {}),
  });
  const workouts: HealthWorkoutSummary[] = [];
  for (const raw of page.workouts ?? []) {
    const sample = sampleFromAnchorWorkout(raw);
    if (!sample) continue;
    const workout = normalizeHealthWorkout(sample);
    if (!workout) continue;
    if (isAppAuthoredHealthWorkout(workout, APP_BUNDLE_ID)) continue;
    workouts.push(workout);
  }
  const deletedUuids = (page.deletedSamples ?? [])
    .map((sample) => sample.uuid?.trim())
    .filter((uuid): uuid is string => Boolean(uuid));
  const newAnchor =
    typeof page.newAnchor === "string" && page.newAnchor.trim()
      ? page.newAnchor.trim()
      : anchor;
  return { workouts, deletedUuids, newAnchor };
}

function uuidFromSavedWorkout(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as {
    uuid?: unknown;
    toJSON?: (key?: string) => { uuid?: unknown };
  };
  if (typeof record.uuid === "string" && record.uuid.trim()) {
    return record.uuid.trim();
  }
  try {
    const json = record.toJSON?.();
    if (typeof json?.uuid === "string" && json.uuid.trim()) {
      return json.uuid.trim();
    }
  } catch {
    // Nitro proxies can throw once the native object is gone.
  }
  return null;
}

export function createHealthKitAdapter(
  native: NativeHealthKit | null = loadNative(),
  options: HealthKitAdapterOptions = {},
): HealthAdapter {
  const bundleAllowsHealthPrompt =
    options.bundleAllowsHealthPrompt ?? (async () => true);

  return {
    async isAvailable() {
      if (!native) return false;
      return nativeAvailable(native, bundleAllowsHealthPrompt);
    },
    async getAuthorizationState(): Promise<HealthAuthorizationState> {
      if (!native) return "unavailable";
      return readAuthorizationState(native, bundleAllowsHealthPrompt);
    },
    async getWriteAuthorizationState(): Promise<HealthAuthorizationState> {
      if (!native) return "unavailable";
      return writeAuthorizationState(native, bundleAllowsHealthPrompt);
    },
    async requestReadAccess(): Promise<HealthAuthorizationState> {
      if (
        !native ||
        !(await nativeAvailable(native, bundleAllowsHealthPrompt))
      ) {
        return "unavailable";
      }
      if (typeof native.requestAuthorization !== "function") return "limited";
      try {
        await native.requestAuthorization({ toRead: [WORKOUT_TYPE] });
      } catch {
        return readAuthorizationState(native, bundleAllowsHealthPrompt);
      }
      return readAuthorizationState(native, bundleAllowsHealthPrompt);
    },
    async requestWriteAccess(): Promise<HealthAuthorizationState> {
      if (
        !native ||
        !(await nativeAvailable(native, bundleAllowsHealthPrompt))
      ) {
        return "unavailable";
      }
      if (typeof native.requestAuthorization !== "function") return "limited";
      try {
        await native.requestAuthorization({
          toRead: [WORKOUT_TYPE],
          toShare: [WORKOUT_TYPE],
        });
      } catch {
        return writeAuthorizationState(native, bundleAllowsHealthPrompt);
      }
      return writeAuthorizationState(native, bundleAllowsHealthPrompt);
    },
    async queryRecentWorkouts({ since, until }) {
      if (
        !native ||
        !(await nativeAvailable(native, bundleAllowsHealthPrompt))
      ) {
        return [];
      }
      return queryPages(native, since, until ?? Date.now());
    },
    async queryWorkoutsSinceAnchor({ anchor, limit }) {
      if (
        !native ||
        !(await nativeAvailable(native, bundleAllowsHealthPrompt))
      ) {
        return { workouts: [], deletedUuids: [], newAnchor: anchor };
      }
      return queryAnchoredPage(
        native,
        anchor,
        limit && limit > 0 ? limit : HEALTH_QUERY_PAGE_SIZE,
      );
    },
    async saveTrackedWorkout(input: HealthTrackedWorkoutInput) {
      if (
        !native ||
        !(await nativeAvailable(native, bundleAllowsHealthPrompt))
      ) {
        throw new Error("Apple Health is unavailable");
      }
      if (typeof native.saveWorkoutSample !== "function") {
        throw new Error("Apple Health cannot save workouts on this device");
      }
      const startedAt = new Date(input.startedAt);
      const endedAt = new Date(input.endedAt);
      const result = await native.saveWorkoutSample(
        HEALTH_EXPORT_ACTIVITY_CODE,
        [],
        startedAt,
        endedAt,
        undefined,
        {
          HKMetadataKeySyncIdentifier: healthSyncIdentifier(input.sessionId),
          HKMetadataKeySyncVersion: 1,
        },
      );
      const uuid = uuidFromSavedWorkout(result);
      if (!uuid) throw new Error("Apple Health did not return a workout");
      return { uuid };
    },
    async enableBackgroundDelivery() {
      if (
        !native ||
        !(await nativeAvailable(native, bundleAllowsHealthPrompt))
      ) {
        return false;
      }
      if (typeof native.enableBackgroundDelivery !== "function") return false;
      try {
        return await native.enableBackgroundDelivery(WORKOUT_TYPE, 1);
      } catch {
        return false;
      }
    },
    async disableBackgroundDelivery() {
      if (!native || typeof native.disableBackgroundDelivery !== "function") {
        return false;
      }
      try {
        return await native.disableBackgroundDelivery(WORKOUT_TYPE);
      } catch {
        return false;
      }
    },
    subscribeToWorkoutChanges(onChange) {
      if (!native || typeof native.subscribeToChanges !== "function") {
        return { remove: () => undefined };
      }
      try {
        const sub = native.subscribeToChanges(WORKOUT_TYPE, () => {
          onChange();
        });
        return {
          remove: () => {
            sub.remove();
          },
        };
      } catch {
        return { remove: () => undefined };
      }
    },
  };
}

export { HEALTH_LOOKBACK_MS } from "./mapping";
