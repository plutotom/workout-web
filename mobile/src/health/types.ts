import type { HealthWorkoutSegment } from "@shared/health-summary";

export type { HealthWorkoutSegment };

export const APPLE_HEALTH_PROVIDER = "apple_health" as const;

export type HealthProvider = typeof APPLE_HEALTH_PROVIDER;

export type HealthAuthorizationState =
  | "unavailable"
  | "not_requested"
  | "connected"
  | "limited";

export type HealthQuantity = {
  quantity: number;
  unit: string;
};

export type HealthWorkoutSample = {
  uuid: string;
  workoutActivityType: string | number;
  startDate: Date | string | number;
  endDate: Date | string | number;
  duration?: HealthQuantity | number | null;
  totalDistance?: HealthQuantity | null;
  totalEnergyBurned?: HealthQuantity | null;
  sourceName?: string | null;
  sourceBundleId?: string | null;
  sourceRevision?: {
    source?: {
      name?: string | null;
      bundleIdentifier?: string | null;
    } | null;
  } | null;
  metadata?: Record<string, unknown> | null;
  /** Nested HKWorkoutActivity legs (triathlon / multisport). */
  activities?: readonly unknown[] | null;
  workoutActivities?: readonly unknown[] | null;
};

export type HealthWorkoutSummary = {
  uuid: string;
  activityType: string;
  activityName: string;
  symbolName: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  distanceMeters: number | null;
  energyKcal: number | null;
  sourceName: string | null;
  sourceBundleId: string | null;
  syncIdentifier?: string | null;
  segments?: HealthWorkoutSegment[];
};

export type HealthOverlapCandidate = {
  sessionId: string;
  templateName: string;
  startedAt: number;
  completedAt: number;
};

export type HealthRowState =
  | { kind: "import" }
  | { kind: "imported"; sessionId: string }
  | { kind: "review"; overlap: HealthOverlapCandidate }
  | { kind: "error"; message: string };

export type HealthListItem = HealthWorkoutSummary & {
  state: HealthRowState;
};

export type HealthTrackedWorkoutInput = {
  sessionId: string;
  startedAt: number;
  endedAt: number;
};

export type HealthAutoImportPrefs = {
  enabled: boolean;
  importAllTypes: boolean;
  types: string[];
};

export type HealthAnchoredWorkoutPage = {
  workouts: HealthWorkoutSummary[];
  deletedUuids: string[];
  newAnchor: string | null;
};

export type HealthAdapter = {
  isAvailable(): Promise<boolean>;
  getAuthorizationState(): Promise<HealthAuthorizationState>;
  getWriteAuthorizationState(): Promise<HealthAuthorizationState>;
  /** Prompts HealthKit. Do not call from query paths or screen mount. */
  requestReadAccess(): Promise<HealthAuthorizationState>;
  /**
   * Prompts for write access. Call only when the user turns on
   * "Save workouts to Apple Health".
   */
  requestWriteAccess(): Promise<HealthAuthorizationState>;
  queryRecentWorkouts(options: {
    since: number;
    until?: number;
  }): Promise<HealthWorkoutSummary[]>;
  queryWorkoutsSinceAnchor(options: {
    anchor: string | null;
    limit?: number;
  }): Promise<HealthAnchoredWorkoutPage>;
  saveTrackedWorkout(
    input: HealthTrackedWorkoutInput,
  ): Promise<{ uuid: string }>;
  enableBackgroundDelivery(): Promise<boolean>;
  disableBackgroundDelivery(): Promise<boolean>;
  subscribeToWorkoutChanges(onChange: () => void): { remove: () => void };
};
