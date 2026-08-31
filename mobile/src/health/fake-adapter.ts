import {
  APP_BUNDLE_ID,
  HEALTH_EXPORT_ACTIVITY_TYPE,
  HEALTH_EXPORT_SOURCE_NAME,
  healthSyncIdentifier,
  isAppAuthoredHealthWorkout,
} from "./mapping";
import type {
  HealthAdapter,
  HealthAuthorizationState,
  HealthTrackedWorkoutInput,
  HealthWorkoutSummary,
} from "./types";

function unavailableError() {
  return new Error("Apple Health is unavailable");
}

const noopSubscription = { remove: () => undefined };

export function createUnavailableHealthAdapter(): HealthAdapter {
  return {
    async isAvailable() {
      return false;
    },
    async getAuthorizationState() {
      return "unavailable";
    },
    async getWriteAuthorizationState() {
      return "unavailable";
    },
    async requestReadAccess() {
      return "unavailable";
    },
    async requestWriteAccess() {
      return "unavailable";
    },
    async queryRecentWorkouts() {
      return [];
    },
    async queryWorkoutsSinceAnchor({ anchor }) {
      return { workouts: [], deletedUuids: [], newAnchor: anchor };
    },
    async saveTrackedWorkout() {
      throw unavailableError();
    },
    async enableBackgroundDelivery() {
      return false;
    },
    async disableBackgroundDelivery() {
      return false;
    },
    subscribeToWorkoutChanges() {
      return noopSubscription;
    },
  };
}

type SavedExport = HealthWorkoutSummary & { sessionId: string };

export function createFakeHealthAdapter(options?: {
  available?: boolean;
  authorization?: HealthAuthorizationState;
  writeAuthorization?: HealthAuthorizationState;
  workouts?: HealthWorkoutSummary[];
}): HealthAdapter {
  let authorization: HealthAuthorizationState =
    options?.authorization ??
    (options?.available === false ? "unavailable" : "not_requested");
  let writeAuthorization: HealthAuthorizationState =
    options?.writeAuthorization ??
    (options?.available === false ? "unavailable" : "not_requested");
  const available = options?.available ?? authorization !== "unavailable";
  const workouts = options?.workouts ?? [];
  const saved: SavedExport[] = [];
  const listeners = new Set<() => void>();

  function visibleWorkouts() {
    return [...workouts, ...saved].filter(
      (workout) => !isAppAuthoredHealthWorkout(workout, APP_BUNDLE_ID),
    );
  }

  return {
    async isAvailable() {
      return available;
    },
    async getAuthorizationState() {
      return available ? authorization : "unavailable";
    },
    async getWriteAuthorizationState() {
      return available ? writeAuthorization : "unavailable";
    },
    async requestReadAccess() {
      if (!available) return "unavailable";
      if (authorization === "not_requested") authorization = "connected";
      return authorization;
    },
    async requestWriteAccess() {
      if (!available) return "unavailable";
      if (writeAuthorization === "not_requested")
        writeAuthorization = "connected";
      return writeAuthorization;
    },
    async queryRecentWorkouts({ since, until }) {
      if (!available || authorization === "not_requested") return [];
      if (authorization === "limited") return [];
      const end = until ?? Date.now();
      return visibleWorkouts()
        .filter(
          (workout) => workout.startedAt >= since && workout.startedAt <= end,
        )
        .sort((a, b) => b.startedAt - a.startedAt);
    },
    async queryWorkoutsSinceAnchor({ anchor, limit }) {
      if (!available || authorization === "not_requested") {
        return { workouts: [], deletedUuids: [], newAnchor: anchor };
      }
      if (authorization === "limited") {
        return { workouts: [], deletedUuids: [], newAnchor: anchor };
      }
      const all = visibleWorkouts().sort((a, b) => a.startedAt - b.startedAt);
      const start = anchor
        ? all.findIndex((workout) => workout.uuid === anchor) + 1
        : 0;
      const fromIndex = start < 0 ? all.length : start;
      const pageSize = limit && limit > 0 ? limit : 100;
      const page = all.slice(fromIndex, fromIndex + pageSize);
      const last = page[page.length - 1];
      return {
        workouts: page,
        deletedUuids: [],
        newAnchor: last?.uuid ?? anchor,
      };
    },
    async saveTrackedWorkout(input: HealthTrackedWorkoutInput) {
      if (!available) throw unavailableError();
      if (
        writeAuthorization === "not_requested" ||
        writeAuthorization === "limited"
      ) {
        throw new Error("Write access has not been granted");
      }
      const existing = saved.find(
        (workout) => workout.sessionId === input.sessionId,
      );
      if (existing) return { uuid: existing.uuid };
      const uuid = `export-${input.sessionId}`;
      saved.push({
        uuid,
        sessionId: input.sessionId,
        activityType: HEALTH_EXPORT_ACTIVITY_TYPE,
        activityName: "Strength",
        symbolName: "dumbbell",
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationSeconds: Math.max(0, (input.endedAt - input.startedAt) / 1000),
        distanceMeters: null,
        energyKcal: null,
        sourceName: HEALTH_EXPORT_SOURCE_NAME,
        sourceBundleId: APP_BUNDLE_ID,
        syncIdentifier: healthSyncIdentifier(input.sessionId),
      });
      return { uuid };
    },
    async enableBackgroundDelivery() {
      if (!available) return false;
      return true;
    },
    async disableBackgroundDelivery() {
      return true;
    },
    subscribeToWorkoutChanges(onChange) {
      if (!available) return noopSubscription;
      listeners.add(onChange);
      return {
        remove: () => {
          listeners.delete(onChange);
        },
      };
    },
  };
}

export function sampleHealthWorkouts(now = Date.now()): HealthWorkoutSummary[] {
  return [
    {
      uuid: "health-run-1",
      activityType: "running",
      activityName: "Run",
      symbolName: "figure.run",
      startedAt: now - 2 * 60 * 60 * 1000,
      endedAt: now - 90 * 60 * 1000,
      durationSeconds: 30 * 60,
      distanceMeters: 5000,
      energyKcal: 420,
      sourceName: "Apple Watch",
      sourceBundleId: "com.apple.health.watch",
    },
    {
      uuid: "health-strength-1",
      activityType: "traditionalStrengthTraining",
      activityName: "Strength",
      symbolName: "dumbbell",
      startedAt: now - 26 * 60 * 60 * 1000,
      endedAt: now - 25 * 60 * 60 * 1000,
      durationSeconds: 55 * 60,
      distanceMeters: null,
      energyKcal: 180,
      sourceName: "Apple Watch",
      sourceBundleId: "com.apple.health.watch",
    },
    {
      uuid: "health-tri-1",
      activityType: "swimBikeRun",
      activityName: "Triathlon",
      symbolName: "figure.mixed.cardio",
      startedAt: now - 4 * 60 * 60 * 1000,
      endedAt: now - 60 * 60 * 1000,
      durationSeconds: 3 * 60 * 60,
      distanceMeters: 34200,
      energyKcal: 1480,
      sourceName: "Apple Watch",
      sourceBundleId: "com.apple.health.watch",
      segments: [
        {
          activityType: "swimming",
          activityName: "Swim",
          startedAt: now - 4 * 60 * 60 * 1000,
          endedAt: now - 4 * 60 * 60 * 1000 + 32 * 60 * 1000,
          durationSeconds: 32 * 60,
          distanceMeters: 1500,
          energyKcal: 280,
        },
        {
          activityType: "transition",
          activityName: "Transition",
          startedAt: now - 4 * 60 * 60 * 1000 + 32 * 60 * 1000,
          endedAt: now - 4 * 60 * 60 * 1000 + 35 * 60 * 1000,
          durationSeconds: 3 * 60,
          distanceMeters: null,
          energyKcal: null,
        },
        {
          activityType: "cycling",
          activityName: "Bike",
          startedAt: now - 4 * 60 * 60 * 1000 + 35 * 60 * 1000,
          endedAt: now - 3 * 60 * 60 * 1000,
          durationSeconds: 60 * 60,
          distanceMeters: 25000,
          energyKcal: 720,
        },
        {
          activityType: "transition",
          activityName: "Transition",
          startedAt: now - 3 * 60 * 60 * 1000,
          endedAt: now - 3 * 60 * 60 * 1000 + 3 * 60 * 1000,
          durationSeconds: 3 * 60,
          distanceMeters: null,
          energyKcal: null,
        },
        {
          activityType: "running",
          activityName: "Run",
          startedAt: now - 3 * 60 * 60 * 1000 + 3 * 60 * 1000,
          endedAt: now - 60 * 60 * 1000,
          durationSeconds: 82 * 60,
          distanceMeters: 7700,
          energyKcal: 480,
        },
      ],
    },
  ];
}
