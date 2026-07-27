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

import { migrateLocalDatabase } from "@/data/local/migrations";
import {
  abandonLocalWorkout,
  addLocalExercise,
  addLocalSet,
  applyIosBootstrap,
  completeSessionSync,
  deleteLocalSet,
  deleteLocalWorkout,
  finishLocalWorkout,
  getLocalActiveWorkout,
  getLastLocalSet,
  getLocalPreferences,
  getLocalTemplates,
  getLocalWorkout,
  getOrCreateDeviceId,
  getPendingSessionSync,
  moveLocalExercise,
  noteSessionSyncAttempt,
  removeLocalExercise,
  saveLocalExerciseNote,
  startLocalBlankWorkout,
  startLocalTemplateWorkout,
  updateLocalSet,
} from "@/data/local/repository";
import type {
  IosBootstrapPayload,
  LocalActiveWorkout,
  LocalPreferences,
  LocalTemplate,
  LocalWorkoutSession,
} from "@/data/local/types";

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
  addExercise: (sessionId: string, slug: string) => Promise<string>;
  removeExercise: (sessionExerciseId: string) => Promise<void>;
  moveExercise: (sessionExerciseId: string, delta: -1 | 1) => Promise<void>;
  saveNote: (slug: string, notes: string) => Promise<void>;
  finish: (sessionId: string) => Promise<void>;
  abandon: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
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
      addExercise: (sessionId, slug) =>
        run(() => addLocalExercise(db, sessionId, slug)),
      removeExercise: (sessionExerciseId) =>
        run(() => removeLocalExercise(db, sessionExerciseId)),
      moveExercise: (sessionExerciseId, delta) =>
        run(() => moveLocalExercise(db, sessionExerciseId, delta)),
      saveNote: (slug, notes) =>
        run(() => saveLocalExerciseNote(db, slug, notes)),
      finish: (sessionId) => run(() => finishLocalWorkout(db, sessionId)),
      abandon: (sessionId) => run(() => abandonLocalWorkout(db, sessionId)),
      deleteSession: (sessionId) =>
        run(() => deleteLocalWorkout(db, sessionId)),
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

export function useLocalTemplates() {
  const db = useSQLiteContext();
  const { revision } = useLocalData();
  return useLocalValue<LocalTemplate[]>(
    () => getLocalTemplates(db),
    [db, revision],
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
      getPending: () => getPendingSessionSync(db),
      noteAttempt: (operationId: string) =>
        noteSessionSyncAttempt(db, operationId),
      complete: async (
        operationId: string,
        sessionId: string,
        remoteSessionId: string | null,
      ) => {
        await completeSessionSync(db, operationId, sessionId, remoteSessionId);
        refresh();
      },
      getDeviceId: () => getOrCreateDeviceId(db),
    }),
    [db, refresh, revision],
  );
}
