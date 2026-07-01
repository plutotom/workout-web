import type { RecentSession } from "@/lib/insights/types";

type QuerySession = {
  sessionId: string;
  templateName: string;
  completedAt: number;
  durationMs: number;
  volume: number;
  exercises: { slug: string; completedCount: number }[];
};

export function summarizeSessionExercises(
  exercises: { slug: string; completedCount: number }[],
  short: (slug: string) => string,
): string {
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
    summary: summarizeSessionExercises(s.exercises, short),
  }));
}
