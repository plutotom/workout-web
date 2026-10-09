import type { NoteUnit, SessionInputMode } from "@shared/note-workouts";
import type { LocalInsightsSession } from "./repository";

export type RemoteSessionSummary = {
  sessionId: string;
  templateName: string;
  completedAt: number;
  durationMs: number;
  volume: number;
  sessionKind?: "tracked" | "health_summary";
  inputMode?: SessionInputMode;
  noteBody?: string | null;
  noteUnit?: NoteUnit | null;
  sourceName?: string | null;
  activityType?: string | null;
  distanceMeters?: number | null;
  energyKcal?: number | null;
  exercises?: Array<{ slug: string; completedCount: number }>;
};

/** Map Convex session history rows into local insights shape for merge/dedupe. */
export function remoteSessionSummariesToLocal(
  sessions: RemoteSessionSummary[],
): LocalInsightsSession[] {
  return sessions.map((session) => {
    const exerciseStubs = (session.exercises ?? []).map((exercise) => ({
      slug: exercise.slug,
      sets: Array.from(
        { length: Math.max(0, exercise.completedCount) },
        (_, index) => ({
          orderIndex: index,
          weight: 0,
          reps: 1,
          completed: true,
        }),
      ),
    }));
    return {
      sessionId: session.sessionId,
      remoteId: session.sessionId,
      templateId: null,
      remoteTemplateId: null,
      templateName: session.templateName,
      startedAt: Math.max(0, session.completedAt - session.durationMs),
      completedAt: session.completedAt,
      sessionKind: session.sessionKind ?? "tracked",
      inputMode: session.inputMode ?? "list",
      noteBody: session.noteBody ?? null,
      noteUnit: session.noteUnit ?? null,
      countsTowardGoals: true,
      placeId: null,
      placeName: null,
      health:
        session.sessionKind === "health_summary"
          ? {
              provider: "apple_health",
              externalId: session.sessionId,
              activityType: session.activityType ?? "other",
              sourceName: session.sourceName ?? null,
              sourceBundleId: null,
              durationSeconds: session.durationMs / 1000,
              energyKcal: session.energyKcal ?? null,
              distanceMeters: session.distanceMeters ?? null,
              importedAt: session.completedAt,
            }
          : null,
      // Synthetic set preserves volume for overview graphs; filtered from UI rows.
      exercises:
        session.inputMode === "note" && exerciseStubs.length === 0
          ? []
          : [
              ...exerciseStubs,
              {
                slug: "__volume__",
                sets: [
                  {
                    orderIndex: 0,
                    weight: session.volume,
                    reps: 1,
                    completed: true,
                  },
                ],
              },
            ],
    };
  });
}
