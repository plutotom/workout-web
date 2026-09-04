import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";

import {
  getLocalExerciseHistory,
  getLocalExerciseRecords,
  getLocalLifts,
  getLocalOverview,
  getLocalSessionHistory,
  getLocalWorkoutRecap,
  mergeLocalAndRemoteSessions,
  type InsightsDays,
  type InsightsOverview,
  type InsightsSessionSummary,
  type WorkoutRecap,
} from "@/data/local/insights";
import { useLocalData, useLocalPlaces } from "@/data/local/provider";
import {
  listLocalCompletedSessions,
  type LocalInsightsSession,
} from "@/data/local/repository";

export type TemplateHistoryRow = {
  sessionId: string;
  completedAt: number;
  exercises: Array<{ slug: string; completedCount: number }>;
};

export type ExerciseHistoryResult = ReturnType<typeof getLocalExerciseHistory>;
export type ExerciseRecordsResult = ReturnType<typeof getLocalExerciseRecords>;

type RemoteSessionSummary = {
  sessionId: string;
  templateName: string;
  completedAt: number;
  durationMs: number;
  volume: number;
  sessionKind?: "tracked" | "health_summary";
  sourceName?: string | null;
  activityType?: string | null;
  distanceMeters?: number | null;
  energyKcal?: number | null;
  exercises?: Array<{ slug: string; completedCount: number }>;
};

type RemoteTemplateHistoryRow = {
  _id: string;
  completedAt: number;
  exercises: Array<{
    slug: string;
    setCount?: number;
    completedCount: number;
  }>;
};

type RemoteExerciseHistorySession = {
  sessionId: string;
  templateName: string;
  completedAt: number;
  bestEst1RM: number;
  sets: Array<{ orderIndex?: number; weight: number; reps: number }>;
};

function useLocalCompletedSessions() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  const [sessions, setSessions] = useState<
    LocalInsightsSession[] | undefined
  >();

  useEffect(() => {
    let active = true;
    void listLocalCompletedSessions(db).then((result) => {
      if (active) setSessions(result);
    });
    return () => {
      active = false;
    };
  }, [db, revision]);

  return sessions;
}

function mergeLoadedSessions(
  localSessions: LocalInsightsSession[] | undefined,
  remote: LocalInsightsSession[],
  remoteReady: boolean,
): LocalInsightsSession[] | undefined {
  if (localSessions === undefined && !remoteReady) return undefined;
  const local = localSessions ?? [];
  if (!remoteReady) return local;
  if (localSessions === undefined) return remote;
  return mergeLocalAndRemoteSessions(local, remote);
}

function matchesTemplateId(
  session: LocalInsightsSession,
  routeId: string,
  localTemplateId: string | null | undefined,
  localRemoteTemplateId: string | null | undefined,
) {
  const keys = new Set<string>([routeId]);
  if (localTemplateId) keys.add(localTemplateId);
  if (localRemoteTemplateId) keys.add(localRemoteTemplateId);
  return (
    (session.templateId !== null && keys.has(session.templateId)) ||
    (session.remoteTemplateId !== null && keys.has(session.remoteTemplateId))
  );
}

function toTemplateHistoryRow(
  session: LocalInsightsSession,
): TemplateHistoryRow {
  return {
    sessionId: session.sessionId,
    completedAt: session.completedAt,
    exercises: session.exercises
      .filter((exercise) => exercise.slug !== "__volume__")
      .map((exercise) => ({
        slug: exercise.slug,
        completedCount: exercise.sets.filter((set) => set.completed).length,
      })),
  };
}

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
      exercises: [
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

function remoteTemplateHistoryToLocal(
  sessions: RemoteTemplateHistoryRow[],
  templateName: string,
): LocalInsightsSession[] {
  return sessions.map((session) => ({
    sessionId: session._id,
    remoteId: session._id,
    templateId: null,
    remoteTemplateId: null,
    templateName,
    startedAt: session.completedAt,
    completedAt: session.completedAt,
    sessionKind: "tracked" as const,
    countsTowardGoals: true,
    health: null,
    placeId: null,
    placeName: null,
    exercises: session.exercises.map((exercise) => ({
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
    })),
  }));
}

function remoteExerciseHistoryToLocal(
  slug: string,
  sessions: RemoteExerciseHistorySession[],
): LocalInsightsSession[] {
  return sessions.map((session) => ({
    sessionId: session.sessionId,
    remoteId: session.sessionId,
    templateId: null,
    remoteTemplateId: null,
    templateName: session.templateName,
    startedAt: session.completedAt,
    completedAt: session.completedAt,
    sessionKind: "tracked" as const,
    countsTowardGoals: true,
    health: null,
    placeId: null,
    placeName: null,
    exercises: [
      {
        slug,
        sets: session.sets.map((set, index) => ({
          orderIndex: set.orderIndex ?? index,
          weight: set.weight,
          reps: set.reps,
          completed: true,
        })),
      },
    ],
  }));
}

export function useLocalInsightsOverview(days: InsightsDays) {
  const sessions = useLocalCompletedSessions();
  return useMemo(
    () =>
      sessions === undefined ? undefined : getLocalOverview(sessions, days),
    [days, sessions],
  );
}

/**
 * Local-first overview. When `remoteSessions` is provided, appends remote-only
 * workouts that are not already present locally (matched by local id / remote id).
 */
export function useMergedInsightsOverview(
  days: InsightsDays,
  remoteSessions: RemoteSessionSummary[] | undefined,
): InsightsOverview | undefined {
  const localSessions = useLocalCompletedSessions();
  return useMemo(() => {
    const merged = mergeLoadedSessions(
      localSessions,
      remoteSessions ? remoteSessionSummariesToLocal(remoteSessions) : [],
      remoteSessions !== undefined,
    );
    return merged === undefined ? undefined : getLocalOverview(merged, days);
  }, [days, localSessions, remoteSessions]);
}

/**
 * Recap for one finished session. `undefined` while loading, `null` when the
 * session isn't a completed local workout.
 */
export function useLocalWorkoutRecap(
  sessionId: string,
): WorkoutRecap | null | undefined {
  const sessions = useLocalCompletedSessions();
  const places = useLocalPlaces();
  const homePlaceId = places?.find((place) => place.starred)?._id ?? null;
  return useMemo(
    () =>
      sessions === undefined || places === undefined
        ? undefined
        : getLocalWorkoutRecap(sessions, sessionId, homePlaceId),
    [homePlaceId, places, sessionId, sessions],
  );
}

export function useLocalInsightsLifts(days: InsightsDays) {
  const sessions = useLocalCompletedSessions();
  return useMemo(
    () => (sessions === undefined ? undefined : getLocalLifts(sessions, days)),
    [days, sessions],
  );
}

export function useLocalInsightsSessions(days: InsightsDays) {
  const sessions = useLocalCompletedSessions();
  return useMemo(
    () =>
      sessions === undefined
        ? undefined
        : getLocalSessionHistory(sessions, days),
    [days, sessions],
  );
}

/**
 * Local-first session history list. Appends remote-only sessions when provided.
 */
export function useMergedInsightsSessions(
  days: InsightsDays,
  remoteSessions: RemoteSessionSummary[] | undefined,
): InsightsSessionSummary[] | undefined {
  const localSessions = useLocalCompletedSessions();
  return useMemo(() => {
    const merged = mergeLoadedSessions(
      localSessions,
      remoteSessions ? remoteSessionSummariesToLocal(remoteSessions) : [],
      remoteSessions !== undefined,
    );
    return merged === undefined
      ? undefined
      : getLocalSessionHistory(merged, days);
  }, [days, localSessions, remoteSessions]);
}

/**
 * Local-first template session history. Filters local completed workouts for
 * the route template id (local id and/or remote id), then merges remote rows.
 */
export function useMergedTemplateHistory(
  templateRouteId: string | undefined,
  remoteSessions: RemoteTemplateHistoryRow[] | undefined,
  options?: {
    localTemplateId?: string | null;
    localRemoteTemplateId?: string | null;
    templateName?: string;
  },
): TemplateHistoryRow[] | undefined {
  const localSessions = useLocalCompletedSessions();
  const localTemplateId = options?.localTemplateId;
  const localRemoteTemplateId = options?.localRemoteTemplateId;
  const templateName = options?.templateName ?? "Workout";

  return useMemo(() => {
    if (!templateRouteId) return undefined;
    if (localSessions === undefined && remoteSessions === undefined) {
      return undefined;
    }

    const localForTemplate = (localSessions ?? []).filter((session) =>
      matchesTemplateId(
        session,
        templateRouteId,
        localTemplateId,
        localRemoteTemplateId,
      ),
    );
    const remote = remoteSessions
      ? remoteTemplateHistoryToLocal(remoteSessions, templateName)
      : [];

    const merged = mergeLoadedSessions(
      localSessions === undefined ? undefined : localForTemplate,
      remote,
      remoteSessions !== undefined,
    );
    return merged === undefined ? undefined : merged.map(toTemplateHistoryRow);
  }, [
    localRemoteTemplateId,
    localSessions,
    localTemplateId,
    remoteSessions,
    templateName,
    templateRouteId,
  ]);
}

export function useLocalExerciseHistory(slug: string, days: InsightsDays) {
  const sessions = useLocalCompletedSessions();
  return useMemo(
    () =>
      sessions === undefined
        ? undefined
        : getLocalExerciseHistory(sessions, slug, days),
    [days, sessions, slug],
  );
}

export function useLocalExerciseRecords(slug: string) {
  const sessions = useLocalCompletedSessions();
  return useMemo(
    () =>
      sessions === undefined
        ? undefined
        : getLocalExerciseRecords(sessions, slug),
    [sessions, slug],
  );
}

/**
 * Local-first exercise history. Merges remote exercise sessions (by session id)
 * without double-counting synced workouts.
 */
export function useMergedExerciseHistory(
  slug: string,
  days: InsightsDays,
  remoteSessions: RemoteExerciseHistorySession[] | undefined,
): ExerciseHistoryResult | undefined {
  const localSessions = useLocalCompletedSessions();
  return useMemo(() => {
    const merged = mergeLoadedSessions(
      localSessions,
      remoteSessions ? remoteExerciseHistoryToLocal(slug, remoteSessions) : [],
      remoteSessions !== undefined,
    );
    return merged === undefined
      ? undefined
      : getLocalExerciseHistory(merged, slug, days);
  }, [days, localSessions, remoteSessions, slug]);
}

/**
 * Local-first exercise records derived from the same merged session set as history.
 */
export function useMergedExerciseRecords(
  slug: string,
  remoteSessions: RemoteExerciseHistorySession[] | undefined,
): ExerciseRecordsResult | undefined {
  const localSessions = useLocalCompletedSessions();
  return useMemo(() => {
    const merged = mergeLoadedSessions(
      localSessions,
      remoteSessions ? remoteExerciseHistoryToLocal(slug, remoteSessions) : [],
      remoteSessions !== undefined,
    );
    return merged === undefined
      ? undefined
      : getLocalExerciseRecords(merged, slug);
  }, [localSessions, remoteSessions, slug]);
}
