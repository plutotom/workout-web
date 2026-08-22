import type {
  HealthAdapter,
  HealthAuthorizationState,
  HealthWorkoutSummary,
} from "./types";

export function createUnavailableHealthAdapter(): HealthAdapter {
  return {
    async isAvailable() {
      return false;
    },
    async getAuthorizationState() {
      return "unavailable";
    },
    async requestReadAccess() {
      return "unavailable";
    },
    async queryRecentWorkouts() {
      return [];
    },
  };
}

export function createFakeHealthAdapter(options?: {
  available?: boolean;
  authorization?: HealthAuthorizationState;
  workouts?: HealthWorkoutSummary[];
}): HealthAdapter {
  let authorization: HealthAuthorizationState =
    options?.authorization ??
    (options?.available === false ? "unavailable" : "not_requested");
  const available = options?.available ?? authorization !== "unavailable";
  const workouts = options?.workouts ?? [];

  return {
    async isAvailable() {
      return available;
    },
    async getAuthorizationState() {
      return available ? authorization : "unavailable";
    },
    async requestReadAccess() {
      if (!available) return "unavailable";
      if (authorization === "not_requested") authorization = "connected";
      return authorization;
    },
    async queryRecentWorkouts({ since, until }) {
      if (!available || authorization === "not_requested") return [];
      if (authorization === "limited") return [];
      const end = until ?? Date.now();
      return workouts
        .filter(
          (workout) => workout.startedAt >= since && workout.startedAt <= end,
        )
        .sort((a, b) => b.startedAt - a.startedAt);
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
  ];
}
