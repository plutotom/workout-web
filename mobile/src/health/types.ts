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

export type HealthAdapter = {
  isAvailable(): Promise<boolean>;
  getAuthorizationState(): Promise<HealthAuthorizationState>;
  /** Always completes authorization before querying. */
  requestReadAccess(): Promise<HealthAuthorizationState>;
  queryRecentWorkouts(options: {
    since: number;
    until?: number;
  }): Promise<HealthWorkoutSummary[]>;
};
