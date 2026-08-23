import { Platform } from "react-native";

import { createUnavailableHealthAdapter } from "@/health/fake-adapter";
import { createHealthKitAdapter } from "@/health/healthkit-adapter";
import type { HealthAdapter } from "@/health/types";

let override: HealthAdapter | null = null;

export function setHealthAdapterForTests(adapter: HealthAdapter | null) {
  override = adapter;
}

export function getHealthAdapter(): HealthAdapter {
  if (override) return override;
  if (Platform.OS !== "ios") return createUnavailableHealthAdapter();
  return createHealthKitAdapter();
}

export { HEALTH_LOOKBACK_MS } from "@/health/mapping";
export {
  createFakeHealthAdapter,
  createUnavailableHealthAdapter,
  sampleHealthWorkouts,
} from "@/health/fake-adapter";
export type {
  HealthAdapter,
  HealthAnchoredWorkoutPage,
  HealthAuthorizationState,
  HealthAutoImportPrefs,
  HealthListItem,
  HealthOverlapCandidate,
  HealthRowState,
  HealthTrackedWorkoutInput,
  HealthWorkoutSummary,
} from "@/health/types";
