import type { HealthWorkoutSegment } from "../health-summary";
import { formatHealthHistoryLine } from "../health-summary";
import type { RecentSession } from "./types";

type QuerySession = {
  sessionId: string;
  templateName: string;
  completedAt: number;
  durationMs: number;
  volume: number;
  sessionKind?: "tracked" | "health_summary";
  sourceName?: string | null;
  distanceMeters?: number | null;
  energyKcal?: number | null;
  healthSegments?: HealthWorkoutSegment[] | null;
  exercises: { slug: string; completedCount: number }[];
};

export function summarizeSessionExercises(
  exercises: { slug: string; completedCount: number }[],
  short: (slug: string) => string,
  session?: Pick<
    QuerySession,
    | "sessionKind"
    | "sourceName"
    | "distanceMeters"
    | "energyKcal"
    | "healthSegments"
  >,
): string {
  const healthLine = formatHealthHistoryLine(session ?? {});
  if (healthLine) return healthLine;
  const done = exercises.filter((e) => e.completedCount > 0);
  if (done.length === 0) return "No sets checked off";
  return done.map((e) => `${short(e.slug)} ${e.completedCount}`).join(" · ");
}

export function mapQuerySessions(
  sessions: QuerySession[],
  short: (slug: string) => string,
): RecentSession[] {
  return sessions.map((s) => ({
    id: s.sessionId,
    name: s.templateName,
    completedAt: s.completedAt,
    durationMinutes: Math.round(s.durationMs / 60_000),
    volumeLb: s.volume,
    summary: summarizeSessionExercises(s.exercises, short, s),
  }));
}
