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
  archiveLocalCustomExercise,
  completeCustomExerciseSync,
  completeSessionSync,
  completeTemplateSync,
  deleteLocalSet,
  deleteLocalTemplate,
  deleteLocalWorkout,
  finishLocalWorkout,
  getLocalActiveWorkout,
  getLastLocalSet,
  getLocalExerciseNotes,
  getLocalPreferences,
  getLocalTemplate,
  getLocalTemplates,
  getLocalWorkout,
  getOrCreateDeviceId,
  getPendingCustomExerciseSync,
  getPendingSessionSync,
  getPendingTemplateSync,
  listLocalCustomExercises,
  moveLocalExercise,
  noteCustomExerciseSyncAttempt,
  noteSessionSyncAttempt,
  noteTemplateSyncAttempt,
  removeLocalExercise,
  saveLocalCustomExercise,
  saveLocalExerciseNote,
  saveLocalTemplate,
  startLocalBlankWorkout,
  startLocalTemplateWorkout,
  updateLocalSet,
} from "@/data/local/repository";
import type {
  IosBootstrapPayload,
  LocalActiveWorkout,
  LocalCustomExercise,
  LocalPreferences,
  LocalTemplate,
  LocalWorkoutSession,
} from "@/data/local/types";

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
  addExercise: (sessionId: string, slug: string) => Promise<string>;
  removeExercise: (sessionExerciseId: string) => Promise<void>;
  moveExercise: (sessionExerciseId: string, delta: -1 | 1) => Promise<void>;
  saveNote: (slug: string, notes: string) => Promise<void>;
  saveTemplate: (input: LocalTemplateInput) => Promise<string>;
  deleteTemplate: (templateId: string) => Promise<LocalTemplate | null>;
  saveCustomExercise: (
    input: LocalCustomExerciseInput,
  ) => Promise<LocalCustomExercise>;
  archiveCustomExercise: (exerciseId: string) => Promise<void>;
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
      saveTemplate: (input) => run(() => saveLocalTemplate(db, input)),
      deleteTemplate: (templateId) =>
        run(() => deleteLocalTemplate(db, templateId)),
      saveCustomExercise: (input) =>
        run(() => saveLocalCustomExercise(db, input)),
      archiveCustomExercise: (exerciseId) =>
        run(() => archiveLocalCustomExercise(db, exerciseId)),
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
