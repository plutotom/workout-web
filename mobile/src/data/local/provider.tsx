import {
  SQLiteProvider,
  useSQLiteContext,
  openDatabaseAsync,
  backupDatabaseAsync,
} from "expo-sqlite";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuthCredentials } from "@/auth/auth-provider";
import {
  accountDatabaseName,
  prepareScopedDatabase,
  trackLocalWrite,
  databaseBelongsTo,
  LEGACY_DATABASE,
} from "./storage-scopes";
import {
  listNoteAlternatives,
  keepNoteAlternative,
  type NoteAlternative,
} from "./note-recovery";

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
  adoptRemoteCompletedWorkout,
  adoptRemoteNoteWorkout,
  applyIosBootstrap,
  archiveLocalCustomExercise,
  attachExportedHealthUuid,
  attachStoredWatchHealthUuid,
  completeCustomExerciseSync,
  completeExerciseNoteSync,
  quarantineExerciseNoteSync,
  completeMachineSync,
  completePlaceSync,
  completePreferencesSync,
  completeSessionDeleteSync,
  completeSessionSync,
  completeTemplateSync,
  convertLocalWorkoutNote,
  consumeWatchHealthUuid,
  countPendingHealthExports,
  createLocalTemplateFromSession,
  deleteLocalSet,
  deleteLocalTemplate,
  deleteLocalWorkout,
  finishLocalWorkout,
  finishLocalNoteWorkout,
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
  getPendingExerciseNoteSync,
  getPendingPreferencesSync,
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
  noteExerciseNoteSyncAttempt,
  notePreferencesSyncAttempt,
  noteSessionSyncAttempt,
  noteTemplateSyncAttempt,
  queueHealthExportIfEnabled,
  quarantineTemplateSync,
  removeLocalExercise,
  wasWatchRecorded,
  saveLocalCustomExercise,
  saveLocalExerciseNote,
  saveLocalSessionExerciseNote,
  saveLocalTemplate,
  setHealthAuthRequested,
  setHealthAutoImportPrefs as writeHealthAutoImportPrefs,
  setHealthExportEnabled as writeHealthExportEnabled,
  patchLocalPreferences,
  setLocalNotificationPreferences as writeLocalNotificationPreferences,
  setLocalSessionMachine,
  setLocalSessionPlace,
  startLocalBlankWorkout,
  startLocalNoteWorkout,
  startLocalTemplateWorkout,
  syncLocalTemplateFromSession,
  updateLocalSet,
  updateLocalWorkoutNote,
  type HealthSummaryImport,
  type LocalOverlapSession,
  type RemoteCompletedListWorkout,
  type RemoteCompletedNoteWorkout,
} from "@/data/local/repository";
import { discardWatchWorkout, endWatchWorkout } from "@/health/watch-bridge";
import { shouldSkipPhoneHealthExport } from "@/health/watch-session";
import {
  archiveLocalPlace,
  createLocalMachine,
  createLocalPlace,
  getLastLocalSessionPlaceId,
  getPendingMachineSync,
  getPendingPlaceSync,
  listLocalMachinesForLift,
  listLocalPlaces,
  noteMachineSyncAttempt,
  notePlaceSyncAttempt,
  renameLocalPlace,
  starLocalPlace,
  upsertLocalMachine,
  upsertLocalPlace,
} from "@/data/local/places";
import type {
  IosBootstrapPayload,
  LocalActiveWorkout,
  LocalCustomExercise,
  LocalMachine,
  LocalGeneralPreferencePatch,
  LocalNotificationPreferences,
  LocalPlace,
  LocalPreferences,
  LocalTemplate,
  LocalWorkoutSession,
} from "@/data/local/types";
import type { HealthAutoImportPrefs } from "@/health/types";
import type { WorkoutExportBundle } from "@shared/workout-export";
import type { NoteConversionPreview } from "@shared/note-conversion-preview";
import type { NoteUnit } from "@shared/note-workouts";

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
  owner: string | null;
  restoreNoteVersion: (version: NoteAlternative) => Promise<void>;
  legacyBackup: () => Promise<WorkoutBackupSnapshot>;
  revision: number;
  refresh: () => void;
  startBlank: (
    abandonExisting?: boolean,
    placeId?: string | null,
  ) => Promise<string>;
  startNote: (
    abandonExisting?: boolean,
    placeId?: string | null,
  ) => Promise<string>;
  saveWorkoutNote: (
    sessionId: string,
    text: string,
    expectedStatus?: "in_progress" | "completed",
  ) => Promise<void>;
  finishNote: (sessionId: string, currentText: string) => Promise<void>;
  convertWorkoutNote: (
    sessionId: string,
    draft: NoteConversionPreview,
    targetUnit: NoteUnit,
  ) => Promise<void>;
  adoptRemoteNoteWorkout: (
    remote: RemoteCompletedNoteWorkout,
  ) => Promise<string>;
  adoptRemoteCompletedWorkout: (
    remote: RemoteCompletedNoteWorkout | RemoteCompletedListWorkout,
  ) => Promise<string>;
  startFromTemplate: (
    templateId: string,
    abandonExisting?: boolean,
    placeId?: string | null,
  ) => Promise<string>;
  setSessionPlace: (
    sessionId: string,
    placeId: string,
  ) => Promise<{ hadCompletedSets: boolean; reseeded: number }>;
  setSessionMachine: (
    sessionExerciseId: string,
    machineId: string,
  ) => Promise<void>;
  adoptPlace: (place: {
    id: string;
    remoteId: string | null;
    name: string;
    starred: boolean;
    archived?: boolean;
  }) => Promise<void>;
  starPlace: (placeId: string) => Promise<void>;
  archivePlace: (placeId: string) => Promise<void>;
  adoptMachine: (machine: {
    id: string;
    remoteId: string | null;
    placeId: string;
    exerciseSlug: string;
    name: string;
    isDefault: boolean;
  }) => Promise<void>;
  createPlace: (name: string) => Promise<LocalPlace>;
  renamePlace: (placeId: string, name: string) => Promise<LocalPlace>;
  createMachine: (input: {
    placeId: string;
    exerciseSlug: string;
    name: string;
  }) => Promise<LocalMachine>;
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
  saveSessionExerciseNote: (exerciseId: string, notes: string) => Promise<void>;
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
  setGeneralPreferences: (patch: LocalGeneralPreferencePatch) => Promise<void>;
  applyBootstrap: (payload: IosBootstrapPayload) => Promise<void>;
};

const LocalDataContext = createContext<LocalDataContextValue | null>(null);

export function LocalDatabaseProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthCredentials();
  const owner = user?.id ?? null;
  const databaseName = accountDatabaseName(owner);
  const initialize = useCallback(
    (db: Parameters<typeof migrateLocalDatabase>[0]) =>
      prepareScopedDatabase(db, owner),
    [owner],
  );
  if (loading && !user) return null;
  return (
    <SQLiteProvider
      key={databaseName}
      databaseName={databaseName}
      onInit={initialize}
    >
      <LocalDataState owner={owner} databaseName={databaseName}>
        {children}
      </LocalDataState>
    </SQLiteProvider>
  );
}

function LocalDataState({
  children,
  owner,
  databaseName,
}: {
  children: ReactNode;
  owner: string | null;
  databaseName: string;
}) {
  const db = useSQLiteContext();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  const run = useCallback(
    async <T,>(operation: () => Promise<T>) => {
      const result = await trackLocalWrite(databaseName, operation);
      refresh();
      return result;
    },
    [databaseName, refresh],
  );

  // Both input modes end Watch recording and use the same Health deduplication.
  const finishTracked = useCallback(
    async (sessionId: string, noteBody?: string) => {
      // Persist first so an invalid note or storage failure leaves a resumable workout.
      if (noteBody !== undefined)
        await finishLocalNoteWorkout(db, sessionId, noteBody);
      // Watch I/O must not hold Finish on screen if the companion hangs.
      void endWatchWorkout().catch(() => undefined);
      if (noteBody === undefined) await finishLocalWorkout(db, sessionId);
      if (noteBody !== undefined) {
        // Completion is already durable. Stored UUIDs and export intent retry in
        // the coordinator; a follow-up failure must not keep Finish on screen.
        await attachStoredWatchHealthUuid(db, sessionId).catch(() => undefined);
        return;
      }
      const watchHealthUuid = await consumeWatchHealthUuid(db, sessionId);
      const watchRecorded = await wasWatchRecorded(db, sessionId);
      if (shouldSkipPhoneHealthExport({ watchRecorded, watchHealthUuid })) {
        if (watchHealthUuid)
          await attachExportedHealthUuid(db, sessionId, watchHealthUuid);
        return;
      }
      await queueHealthExportIfEnabled(db, sessionId);
    },
    [db],
  );

  const value = useMemo<LocalDataContextValue>(
    () => ({
      owner,
      restoreNoteVersion: (version) =>
        run(async () => {
          const versions = await listNoteAlternatives(db);
          if (
            !versions.some(
              (saved) =>
                saved.slug === version.slug && saved.notes === version.notes,
            )
          )
            throw new Error("That saved note version is unavailable");
          const current = await getLocalExerciseNotes(db, [version.slug]);
          if (current[version.slug] !== undefined)
            await keepNoteAlternative(db, version.slug, current[version.slug]);
          await saveLocalExerciseNote(db, version.slug, version.notes);
        }),
      legacyBackup: async () => {
        const legacy = await openDatabaseAsync(LEGACY_DATABASE, {
          useNewConnection: true,
        });
        const copy = await openDatabaseAsync(":memory:", {
          useNewConnection: true,
        });
        try {
          const stamp = await legacy.getFirstAsync<{ value: string }>(
            "SELECT value FROM local_metadata WHERE key = 'storage:owner'",
          );
          if (
            stamp?.value.startsWith("account:") &&
            stamp.value !== `account:${owner}`
          )
            throw new Error(
              "Sign in to the account that owns these older workouts",
            );
          await backupDatabaseAsync({
            sourceDatabase: legacy,
            destDatabase: copy,
          });
          await migrateLocalDatabase(copy);
          return await createLocalBackup(copy);
        } finally {
          await copy.closeAsync();
          await legacy.closeAsync();
        }
      },
      revision,
      refresh,
      startBlank: (abandonExisting, placeId) =>
        run(() => startLocalBlankWorkout(db, abandonExisting, placeId)),
      startNote: (abandonExisting, placeId) =>
        run(() => startLocalNoteWorkout(db, abandonExisting, placeId)),
      saveWorkoutNote: (sessionId, text, expectedStatus) =>
        run(() => updateLocalWorkoutNote(db, sessionId, text, expectedStatus)),
      finishNote: (sessionId, currentText) =>
        run(() => finishTracked(sessionId, currentText)),
      convertWorkoutNote: (sessionId, draft, targetUnit) =>
        run(() => convertLocalWorkoutNote(db, sessionId, draft, targetUnit)),
      adoptRemoteNoteWorkout: (remote) =>
        trackLocalWrite(databaseName, () =>
          adoptRemoteNoteWorkout(db, remote, refresh),
        ),
      adoptRemoteCompletedWorkout: (remote) =>
        trackLocalWrite(databaseName, () =>
          adoptRemoteCompletedWorkout(db, remote, refresh),
        ),
      startFromTemplate: (templateId, abandonExisting, placeId) =>
        run(() =>
          startLocalTemplateWorkout(db, templateId, abandonExisting, placeId),
        ),
      setSessionPlace: (sessionId, placeId) =>
        run(() => setLocalSessionPlace(db, sessionId, placeId)),
      setSessionMachine: (sessionExerciseId, machineId) =>
        run(() => setLocalSessionMachine(db, sessionExerciseId, machineId)),
      adoptPlace: (place) => run(() => upsertLocalPlace(db, place)),
      starPlace: (placeId) => run(() => starLocalPlace(db, placeId)),
      archivePlace: (placeId) => run(() => archiveLocalPlace(db, placeId)),
      adoptMachine: (machine) => run(() => upsertLocalMachine(db, machine)),
      createPlace: (name) => run(() => createLocalPlace(db, name)),
      renamePlace: (placeId, name) =>
        run(() => renameLocalPlace(db, placeId, name)),
      createMachine: (input) => run(() => createLocalMachine(db, input)),
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
      saveSessionExerciseNote: (exerciseId, notes) =>
        run(() => saveLocalSessionExerciseNote(db, exerciseId, notes)),
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
      finish: (sessionId) => run(() => finishTracked(sessionId)),
      abandon: (sessionId) =>
        run(async () => {
          void discardWatchWorkout().catch(() => undefined);
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
      setGeneralPreferences: (patch) =>
        run(() => patchLocalPreferences(db, patch)),
      applyBootstrap: (payload) => run(() => applyIosBootstrap(db, payload)),
    }),
    [db, databaseName, owner, finishTracked, refresh, revision, run],
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

export function useDataRecovery() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue(
    async () => ({
      alternatives: await listNoteAlternatives(db),
      legacyAvailable: Boolean(
        await db.getFirstAsync(
          "SELECT value FROM local_metadata WHERE key = 'recovery:legacy-available'",
        ),
      ),
    }),
    [db, revision],
  );
}

export function useLocalPlaces() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<LocalPlace[]>(() => listLocalPlaces(db), [db, revision]);
}

export function useLastLocalSessionPlaceId() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<string | null>(
    () => getLastLocalSessionPlaceId(db),
    [db, revision],
  );
}

export function useLocalMachinesForLift(
  placeId?: string | null,
  slug?: string,
) {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<LocalMachine[]>(
    () =>
      placeId && slug
        ? listLocalMachinesForLift(db, placeId, slug)
        : Promise.resolve([]),
    [db, revision, placeId, slug],
  );
}

export function useLocalLastSet(
  slug?: string,
  scope?: { placeId?: string | null; machineId?: string | null },
) {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<{
    weight: number;
    reps: number;
    placeName: string | null;
  } | null>(
    () => (slug ? getLastLocalSet(db, slug, scope) : Promise.resolve(null)),
    [db, revision, slug, scope?.placeId, scope?.machineId],
  );
}

export function useLocalSyncStore() {
  const db = useSQLiteContext();
  const { refresh, revision, owner } = useLocalData();
  return useMemo(
    () => ({
      revision,
      owner,
      ownsAccount: (subject: string) => databaseBelongsTo(db, subject),
      getPendingSession: () => getPendingSessionSync(db),
      getPendingSessionDelete: () => getPendingSessionDelete(db),
      getPendingTemplate: () => getPendingTemplateSync(db),
      getPendingCustomExercise: () => getPendingCustomExerciseSync(db),
      getPendingPlace: () => getPendingPlaceSync(db),
      getPendingMachine: () => getPendingMachineSync(db),
      getPendingPreferences: () => getPendingPreferencesSync(db),
      getPendingExerciseNote: () => getPendingExerciseNoteSync(db),
      noteSessionAttempt: (operationId: string) =>
        noteSessionSyncAttempt(db, operationId),
      noteTemplateAttempt: (operationId: string) =>
        noteTemplateSyncAttempt(db, operationId),
      quarantineTemplate: async (operationId: string) => {
        await quarantineTemplateSync(db, operationId);
        refresh();
      },
      noteCustomExerciseAttempt: (operationId: string) =>
        noteCustomExerciseSyncAttempt(db, operationId),
      notePlaceAttempt: (operationId: string) =>
        notePlaceSyncAttempt(db, operationId),
      noteMachineAttempt: (operationId: string) =>
        noteMachineSyncAttempt(db, operationId),
      notePreferencesAttempt: (operationId: string) =>
        notePreferencesSyncAttempt(db, operationId),
      noteExerciseNoteAttempt: (operationId: string) =>
        noteExerciseNoteSyncAttempt(db, operationId),
      completePlace: async (
        operationId: string,
        placeId: string,
        remotePlaceId: string,
      ) => {
        await completePlaceSync(db, operationId, placeId, remotePlaceId);
        refresh();
      },
      completeMachine: async (
        operationId: string,
        machineId: string,
        remoteMachineId: string,
      ) => {
        await completeMachineSync(db, operationId, machineId, remoteMachineId);
        refresh();
      },
      completePreferences: async (operationId: string) => {
        await completePreferencesSync(db, operationId);
        refresh();
      },
      completeExerciseNote: async (operationId: string, revision?: number) => {
        await completeExerciseNoteSync(db, operationId, revision);
        refresh();
      },
      quarantineExerciseNote: async (operationId: string) => {
        await quarantineExerciseNoteSync(db, operationId);
        refresh();
      },
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
    [db, owner, refresh, revision],
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
