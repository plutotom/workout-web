import type { Infer } from "convex/values";

import { healthSegmentValidator } from "../schemas/workouts";

export type SessionKind = "tracked" | "health_summary";

export type HealthSegment = Infer<typeof healthSegmentValidator>;

export function sessionHealthSegments(session: {
  healthSegments?: HealthSegment[] | null;
}): HealthSegment[] {
  return session.healthSegments ?? [];
}

export function normalizeSessionKind(
  value: string | null | undefined,
): SessionKind {
  return value === "health_summary" ? "health_summary" : "tracked";
}

export function sessionCountsTowardGoals(session: {
  sessionKind?: SessionKind | null;
  countsTowardGoals?: boolean | null;
  hasLoggedWork: boolean;
}) {
  if (session.sessionKind === "health_summary") {
    return session.countsTowardGoals !== false;
  }
  return session.hasLoggedWork;
}
