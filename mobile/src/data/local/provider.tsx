import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  BACKUP_STALE_AFTER_MS,
  createLocalBackup,
  getLastBackupAt,
  markBackupSaved,
  restoreLocalBackup,
  type LocalRestoreResult,
  type WorkoutBackupSnapshot,
} from "@/data/local/backup";
import { migrateLocalDatabase } from "@/data/local/migrations";
import {
  abandonLocalWorkout,
  addLocalExercise,
  addLocalSet,
  applyIosBootstrap,
  archiveLocalCustomExercise,
  attachExportedHealthUuid,
  completeCustomExerciseSync,
  completeSessionDeleteSync,
  completeSessionSync,
  completeTemplateSync,
  consumeWatchHealthUuid,
  countPendingHealthExports,
  createLocalTemplateFromSession,
  deleteLocalSet,
  deleteLocalTemplate,
  deleteLocalWorkout,
  finishLocalWorkout,
  getHealthAuthRequested,
  getHealthAutoImportPrefs,
  getHealthExportEnabled,
  getLocalActiveWorkout,
  getLastLocalSet,
  getLocalExerciseNotes,
  getLocalPreferences,
  getLocalTemplate,
  getLocalTemplates,
  getLocalWorkout,
  getOrCreateDeviceId,
  restoreLocalCustomExercise,
  getPendingCustomExerciseSync,
  getPendingSessionDelete,
  getPendingSessionSync,
  getPendingTemplateSync,
  ignoreHealthWorkout,
  importHealthSummarySession,
  importLocalBundle,
  linkHealthSummaryToSession,
  listImportedHealthIds,
  listIgnoredHealthIds,
  listLocalCustomExercises,
  listLocalOverlapCandidates,
  localSessionTemplateDiffers,
  moveLocalExercise,
  noteCustomExerciseSyncAttempt,
  noteSessionSyncAttempt,
  noteTemplateSyncAttempt,
  queueHealthExportIfEnabled,
  removeLocalExercise,
  wasWatchRecorded,
  saveLocalCustomExercise,
  saveLocalExerciseNote,
  saveLocalTemplate,
  setHealthAuthRequested,
  setHealthAutoImportPrefs as writeHealthAutoImportPrefs,
  setHealthExportEnabled as writeHealthExportEnabled,
  setLocalNotificationPreferences as writeLocalNotificationPreferences,
  startLocalBlankWorkout,
  startLocalTemplateWorkout,
  syncLocalTemplateFromSession,
  updateLocalSet,
  type HealthSummaryImport,
  type LocalOverlapSession,
} from "@/data/local/repository";
import { discardWatchWorkout, endWatchWorkout } from "@/health/watch-bridge";
import { shouldSkipPhoneHealthExport } from "@/health/watch-session";
import type {
  IosBootstrapPayload,
  LocalActiveWorkout,
  LocalCustomExercise,
  LocalNotificationPreferences,
  LocalPreferences,
  LocalTemplate,
  LocalWorkoutSession,
} from "@/data/local/types";
import type { HealthAutoImportPrefs } from "@/health/types";
import type { WorkoutExportBundle } from "@shared/workout-export";

type LocalTemplateInput = {
  templateId?: string;
  name: string;
  exercises: Array<{
    slug: string;
    sets: Array<{ weight: number; reps: number }>;
  }>;
};

type LocalCustomExerciseInput = {
  exerciseId?: string;
  name: string;
  short?: string;
  category: string;
  usesBar: boolean;
};

type LocalDataContextValue = {
  revision: number;
  refresh: () => void;
  startBlank: (abandonExisting?: boolean) => Promise<string>;
  startFromTemplate: (
    templateId: string,
    abandonExisting?: boolean,
  ) => Promise<string>;
  updateSet: (
    setId: string,
    values: { weight?: number; reps?: number; completed?: boolean },
  ) => Promise<void>;
  addSet: (sessionExerciseId: string) => Promise<string>;
  deleteSet: (setId: string) => Promise<void>;
  addExercise: (
    sessionId: string,
    slug: string,
    sets?: { weight: number; reps: number }[],
  ) => Promise<string>;
  removeExercise: (sessionExerciseId: string) => Promise<void>;
  moveExercise: (sessionExerciseId: string, delta: -1 | 1) => Promise<void>;
  saveNote: (slug: string, notes: string) => Promise<void>;
  saveTemplate: (input: LocalTemplateInput) => Promise<string>;
  /** Quick-start session → new template, linked to the session. */
  saveTemplateFromSession: (sessionId: string, name: string) => Promise<string>;
  /** Write today's exercises, order and weights back onto the session's template. */
  updateTemplateFromSession: (sessionId: string) => Promise<void>;
  /** Read-only: whether the session's template presets have drifted. */
  templateNeedsUpdate: (sessionId: string) => Promise<boolean>;
  deleteTemplate: (templateId: string) => Promise<LocalTemplate | null>;
  saveCustomExercise: (
    input: LocalCustomExerciseInput,
  ) => Promise<LocalCustomExercise>;
  archiveCustomExercise: (exerciseId: string) => Promise<void>;
  restoreCustomExercise: (exerciseId: string) => Promise<void>;
  /** Additive local import — works offline; sync uploads later if signed in. */
  importBundle: (
    bundle: WorkoutExportBundle,
  ) => Promise<Awaited<ReturnType<typeof importLocalBundle>>>;
  /** Whole-database snapshot for the file backup. */
  createBackup: () => Promise<WorkoutBackupSnapshot>;
  /** Additive, idempotent merge — existing rows always win. */
  restoreBackup: (
    snapshot: WorkoutBackupSnapshot,
  ) => Promise<LocalRestoreResult>;
  /** Stamps the backup status line — see `markBackupSaved` on its accuracy. */
  noteBackupSaved: () => Promise<void>;
  finish: (sessionId: string) => Promise<void>;
  abandon: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  importHealthSummary: (
    workout: HealthSummaryImport,
  ) => Promise<{ sessionId: string; alreadyImported: boolean }>;
  linkHealthSummary: (
    sessionId: string,
    workout: HealthSummaryImport,
  ) => Promise<void>;
  ignoreHealthUuid: (externalId: string) => Promise<void>;
  markHealthAuthRequested: () => Promise<void>;
  setHealthExportEnabled: (enabled: boolean) => Promise<void>;
  setHealthAutoImportPrefs: (prefs: HealthAutoImportPrefs) => Promise<void>;
  setNotificationPreferences: (
    preferences: LocalNotificationPreferences,
  ) => Promise<void>;
  applyBootstrap: (payload: IosBootstrapPayload) => Promise<void>;
};

const LocalDataContext = createContext<LocalDataContextValue | null>(null);

export function LocalDatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider
      databaseName="workout-local-v1.db"
      onInit={migrateLocalDatabase}
    >
      <LocalDataState>{children}</LocalDataState>
    </SQLiteProvider>
  );
}

function LocalDataState({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  const run = useCallback(
    async <T,>(operation: () => Promise<T>) => {
      const result = await operation();
      refresh();
      return result;
    },
    [refresh],
  );

  const value = useMemo<LocalDataContextValue>(
    () => ({
      revision,
      refresh,
      startBlank: (abandonExisting) =>
        run(() => startLocalBlankWorkout(db, abandonExisting)),
      startFromTemplate: (templateId, abandonExisting) =>
        run(() => startLocalTemplateWorkout(db, templateId, abandonExisting)),
      updateSet: (setId, values) =>
        run(() => updateLocalSet(db, setId, values)),
      addSet: (sessionExerciseId) =>
        run(() => addLocalSet(db, sessionExerciseId)),
      deleteSet: (setId) => run(() => deleteLocalSet(db, setId)),
      addExercise: (sessionId, slug, sets) =>
        run(() => addLocalExercise(db, sessionId, slug, sets)),
      removeExercise: (sessionExerciseId) =>
        run(() => removeLocalExercise(db, sessionExerciseId)),
      moveExercise: (sessionExerciseId, delta) =>
        run(() => moveLocalExercise(db, sessionExerciseId, delta)),
      saveNote: (slug, notes) =>
        run(() => saveLocalExerciseNote(db, slug, notes)),
      saveTemplate: (input) => run(() => saveLocalTemplate(db, input)),
      saveTemplateFromSession: (sessionId, name) =>
        run(() => createLocalTemplateFromSession(db, sessionId, name)),
      updateTemplateFromSession: (sessionId) =>
        run(() => syncLocalTemplateFromSession(db, sessionId)),
      // A read, so it deliberately skips `run` and its refresh.
      templateNeedsUpdate: (sessionId) =>
        localSessionTemplateDiffers(db, sessionId),
      deleteTemplate: (templateId) =>
        run(() => deleteLocalTemplate(db, templateId)),
      saveCustomExercise: (input) =>
        run(() => saveLocalCustomExercise(db, input)),
      archiveCustomExercise: (exerciseId) =>
        run(() => archiveLocalCustomExercise(db, exerciseId)),
      restoreCustomExercise: (exerciseId) =>
        run(() => restoreLocalCustomExercise(db, exerciseId)),
      importBundle: (bundle) => run(() => importLocalBundle(db, bundle)),
      // A read, so it deliberately skips `run` and its refresh.
      createBackup: () => createLocalBackup(db),
      restoreBackup: (snapshot) => run(() => restoreLocalBackup(db, snapshot)),
      noteBackupSaved: () => run(() => markBackupSaved(db)),
      finish: (sessionId) =>
        run(async () => {
          await endWatchWorkout().catch(() => undefined);
          await finishLocalWorkout(db, sessionId);
          const watchHealthUuid = await consumeWatchHealthUuid(db, sessionId);
          const watchRecorded = await wasWatchRecorded(db, sessionId);
          if (
            shouldSkipPhoneHealthExport({
              watchRecorded,
              watchHealthUuid,
            })
          ) {
            if (watchHealthUuid) {
              await attachExportedHealthUuid(db, sessionId, watchHealthUuid);
            }
            return;
          }
          await queueHealthExportIfEnabled(db, sessionId);
        }),
      abandon: (sessionId) =>
        run(async () => {
          await discardWatchWorkout().catch(() => undefined);
          await abandonLocalWorkout(db, sessionId);
        }),
      deleteSession: (sessionId) =>
        run(() => deleteLocalWorkout(db, sessionId)),
      importHealthSummary: (workout) =>
        run(() => importHealthSummarySession(db, workout)),
      linkHealthSummary: (sessionId, workout) =>
        run(() => linkHealthSummaryToSession(db, sessionId, workout)),
      ignoreHealthUuid: (externalId) =>
        run(() => ignoreHealthWorkout(db, externalId)),
      markHealthAuthRequested: () => run(() => setHealthAuthRequested(db)),
      setHealthExportEnabled: (enabled) =>
        run(() => writeHealthExportEnabled(db, enabled)),
      setHealthAutoImportPrefs: (prefs) =>
        run(() => writeHealthAutoImportPrefs(db, prefs)),
      setNotificationPreferences: (preferences) =>
        run(() => writeLocalNotificationPreferences(db, preferences)),
      applyBootstrap: (payload) => run(() => applyIosBootstrap(db, payload)),
    }),
    [db, refresh, revision, run],
  );

  return (
    <LocalDataContext.Provider value={value}>
      {children}
    </LocalDataContext.Provider>
  );
}

export function useLocalData() {
  const value = useContext(LocalDataContext);
  if (!value)
    throw new Error("useLocalData must be used within LocalDatabaseProvider");
  return value;
}

function useLocalValue<T>(
  load: () => Promise<T>,
  dependencies: readonly unknown[],
) {
  const [value, setValue] = useState<T | undefined>();
  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setValue(result);
    });
    return () => {
      active = false;
    };
    // The caller supplies the exact invalidation dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return value;
}

export function useLocalActiveWorkout() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<LocalActiveWorkout | null>(
    () => getLocalActiveWorkout(db),
    [db, revision],
  );
}

export function useLocalWorkout(sessionId: string) {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<LocalWorkoutSession | null>(
    () => getLocalWorkout(db, sessionId),
    [db, revision, sessionId],
  );
}

export function useLocalPreferences() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<LocalPreferences>(
    () => getLocalPreferences(db),
    [db, revision],
  );
}

export type BackupStatus = {
  /** `null` when nothing has ever been backed up on this install. */
  at: number | null;
  stale: boolean;
  /** The clock reading `stale` was derived from, so callers can format
   *  against the same instant instead of calling `Date.now()` in render. */
  checkedAt: number;
};

/** `undefined` while still loading. */
export function useBackupStatus() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<BackupStatus>(async () => {
    const at = await getLastBackupAt(db);
    const checkedAt = Date.now();
    return {
      at,
      stale: at === null || checkedAt - at > BACKUP_STALE_AFTER_MS,
      checkedAt,
    };
  }, [db, revision]);
}

export function useLocalTemplates() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<LocalTemplate[]>(
    () => getLocalTemplates(db),
    [db, revision],
  );
}

export function useLocalTemplate(templateId?: string) {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<LocalTemplate | null>(
    () =>
      templateId ? getLocalTemplate(db, templateId) : Promise.resolve(null),
    [db, revision, templateId],
  );
}

export function useLocalCustomExercises() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<LocalCustomExercise[]>(
    () => listLocalCustomExercises(db),
    [db, revision],
  );
}

export function useLocalExerciseNotes(slugs: string[]) {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  const key = slugs.slice().sort().join("\0");
  return useLocalValue<Record<string, string>>(
    () => getLocalExerciseNotes(db, slugs),
    [db, revision, key],
  );
}

export function useLocalLastSet(slug?: string) {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<{ weight: number; reps: number } | null>(
    () => (slug ? getLastLocalSet(db, slug) : Promise.resolve(null)),
    [db, revision, slug],
  );
}

export function useLocalSyncStore() {
  const db = useSQLiteContext();
  const { refresh, revision } = useLocalData();
  return useMemo(
    () => ({
      revision,
      getPendingSession: () => getPendingSessionSync(db),
      getPendingSessionDelete: () => getPendingSessionDelete(db),
      getPendingTemplate: () => getPendingTemplateSync(db),
      getPendingCustomExercise: () => getPendingCustomExerciseSync(db),
      noteSessionAttempt: (operationId: string) =>
        noteSessionSyncAttempt(db, operationId),
      noteTemplateAttempt: (operationId: string) =>
        noteTemplateSyncAttempt(db, operationId),
      noteCustomExerciseAttempt: (operationId: string) =>
        noteCustomExerciseSyncAttempt(db, operationId),
      completeCustomExercise: async (
        operationId: string,
        exerciseId: string,
        remoteExerciseId: string,
        remoteSlug: string,
      ) => {
        await completeCustomExerciseSync(
          db,
          operationId,
          exerciseId,
          remoteExerciseId,
          remoteSlug,
        );
        refresh();
      },
      completeSession: async (
        operationId: string,
        sessionId: string,
        remoteSessionId: string | null,
      ) => {
        await completeSessionSync(db, operationId, sessionId, remoteSessionId);
        refresh();
      },
      completeSessionDelete: async (operationId: string) => {
        await completeSessionDeleteSync(db, operationId);
        refresh();
      },
      completeTemplate: async (
        operationId: string,
        templateId: string,
        remoteTemplateId: string | null,
      ) => {
        await completeTemplateSync(
          db,
          operationId,
          templateId,
          remoteTemplateId,
        );
        refresh();
      },
      getDeviceId: () => getOrCreateDeviceId(db),
    }),
    [db, refresh, revision],
  );
}

export function useHealthImportLookups() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<{
    imported: Map<
      string,
      { sessionId: string; sessionKind: "tracked" | "health_summary" }
    >;
    ignored: Set<string>;
    overlapCandidates: LocalOverlapSession[];
    authRequested: boolean;
  }>(async () => {
    const [imported, ignored, overlapCandidates, authRequested] =
      await Promise.all([
        listImportedHealthIds(db),
        listIgnoredHealthIds(db),
        listLocalOverlapCandidates(db),
        getHealthAuthRequested(db),
      ]);
    return { imported, ignored, overlapCandidates, authRequested };
  }, [db, revision]);
}

export function useHealthExportPrefs() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<{ enabled: boolean; pendingCount: number }>(async () => {
    const [enabled, pendingCount] = await Promise.all([
      getHealthExportEnabled(db),
      countPendingHealthExports(db),
    ]);
    return { enabled, pendingCount };
  }, [db, revision]);
}

export function useHealthAutoImportPrefs() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<HealthAutoImportPrefs>(
    () => getHealthAutoImportPrefs(db),
    [db, revision],
  );
}
