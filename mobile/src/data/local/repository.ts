import { randomUUID } from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

import { parseHealthAutoImportPrefs } from "@/health/auto-import";
import { healthExportEndMs, shouldQueueHealthExport } from "@/health/export";
import {
  APP_BUNDLE_ID,
  HEALTH_EXPORT_ACTIVITY_TYPE,
  HEALTH_EXPORT_SOURCE_NAME,
} from "@/health/mapping";
import type { HealthAutoImportPrefs } from "@/health/types";
import { watchHealthUuidKey, watchRecordedKey } from "@/health/watch-session";

import type {
  CustomExerciseSyncSnapshot,
  IosBootstrapPayload,
  LocalActiveWorkout,
  LocalCustomExercise,
  LocalHealthSummary,
  LocalMuscleGroup,
  LocalNotificationPreferences,
  LocalPreferences,
  LocalSessionKind,
  LocalTemplate,
  LocalWorkoutExercise,
  LocalWorkoutSession,
  LocalWorkoutSet,
  PendingCustomExerciseSync,
  PendingSessionDelete,
  PendingSessionSync,
  SessionDeleteSnapshot,
  SessionSyncSnapshot,
} from "@/data/local/types";
import {
  isUnsyncedTemplateRemoteId,
  localCustomSlug,
  localTemplateRemoteId,
  remoteCustomSlug,
} from "@/data/local/types";
import {
  applyPlacesBootstrap,
  assignLocalSessionMachine,
  convexMachineId,
  convexPlaceId,
  ensureLocalHomePlace,
  findStarredLocalPlace,
  getLocalPlace,
  getLocalWorkingSets,
  lastLocalMachineForLift,
  recordLocalSessionPlaceMemory,
  reseedLocalSessionToPlace,
  resolveLocalPlaceForStart,
  seedLocalSetRows,
} from "@/data/local/places";
import { setRowsForNewExercise } from "@/data/local/exercise-sets";
import {
  convertWeight,
  type WorkoutExportBundle,
} from "@shared/workout-export";

const DEFAULT_REST_SECONDS = 75;
const MAX_EXERCISES = 50;
const MAX_SETS = 20;
const MAX_WEIGHT = 10_000;
const MAX_REPS = 1_000;
const MAX_CUSTOM_EXERCISES = 200;
const MAX_CUSTOM_NAME_LENGTH = 80;
const MAX_TEMPLATES_PER_IMPORT = 50;
const CUSTOM_SLUG_PREFIX = "custom:";
/** Orphan `custom:` lifts with no definition fall back to chest / no bar. */
const ORPHAN_FALLBACK_CATEGORY: LocalMuscleGroup = "chest";
const MUSCLE_GROUPS: readonly LocalMuscleGroup[] = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "core",
];

type SessionRow = {
  id: string;
  remote_id: string | null;
  template_id: string | null;
  remote_template_id: string | null;
  template_name: string;
  status: LocalWorkoutSession["status"];
  session_kind: LocalSessionKind | null;
  started_at: number;
  completed_at: number | null;
  updated_at: number;
  counts_toward_goals: number | null;
  external_provider: string | null;
  external_id: string | null;
  activity_type: string | null;
  source_name: string | null;
  source_bundle_id: string | null;
  duration_seconds: number | null;
  energy_kcal: number | null;
  distance_meters: number | null;
  imported_at: number | null;
  place_id: string | null;
  place_name: string | null;
};

const SESSION_COLUMNS = `id, remote_id, template_id, remote_template_id, template_name,
            status, session_kind, started_at, completed_at, updated_at,
            counts_toward_goals, external_provider, external_id, activity_type,
            source_name, source_bundle_id, duration_seconds, energy_kcal,
            distance_meters, imported_at, place_id, place_name`;

function mapHealthSummary(row: SessionRow): LocalHealthSummary | null {
  if (row.external_provider !== "apple_health" || !row.external_id) return null;
  return {
    provider: "apple_health",
    externalId: row.external_id,
    activityType: row.activity_type ?? "other",
    sourceName: row.source_name,
    sourceBundleId: row.source_bundle_id,
    durationSeconds: row.duration_seconds,
    energyKcal: row.energy_kcal,
    distanceMeters: row.distance_meters,
    importedAt: row.imported_at,
  };
}

function mapSessionKind(value: string | null): LocalSessionKind {
  return value === "health_summary" ? "health_summary" : "tracked";
}

type ExerciseRow = {
  id: string;
  session_id: string;
  slug: string;
  order_index: number;
  rest_seconds: number;
  notes: string | null;
  machine_id: string | null;
  machine_name: string | null;
};

type SetRow = {
  id: string;
  session_exercise_id: string;
  order_index: number;
  target_weight: number;
  target_reps: number;
  weight: number;
  reps: number;
  completed: number;
  completed_at: number | null;
};

type TemplateRow = {
  id: string;
  remote_id: string;
  name: string;
  updated_at: number;
  last_place_id: string | null;
};

type TemplateExerciseRow = {
  slug: string;
  order_index: number;
  sets_json: string;
};

function boundedWhole(value: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${label} must be between 0 and ${max}`);
  }
  return Math.round(value);
}

function normalizedSlug(value: string) {
  const slug = value.trim();
  if (!slug || slug.length > 64)
    throw new Error("Exercise slug must be between 1 and 64 characters");
  return slug;
}

function mapSet(row: SetRow): LocalWorkoutSet {
  return {
    _id: row.id,
    sessionExerciseId: row.session_exercise_id,
    orderIndex: row.order_index,
    targetWeight: row.target_weight,
    targetReps: row.target_reps,
    weight: row.weight,
    reps: row.reps,
    completed: row.completed === 1,
    completedAt: row.completed_at ?? undefined,
  };
}

async function loadExercise(
  db: SQLiteDatabase,
  row: ExerciseRow,
): Promise<LocalWorkoutExercise> {
  const sets = await db.getAllAsync<SetRow>(
    `SELECT id, session_exercise_id, order_index, target_weight, target_reps,
            weight, reps, completed, completed_at
       FROM local_sets
      WHERE session_exercise_id = ?
      ORDER BY order_index`,
    row.id,
  );
  return {
    _id: row.id,
    sessionId: row.session_id,
    slug: row.slug,
    orderIndex: row.order_index,
    restSeconds: row.rest_seconds,
    notes: row.notes ?? undefined,
    machineId: row.machine_id,
    machineName: row.machine_name,
    sets: sets.map(mapSet),
  };
}

export async function getLocalWorkout(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<LocalWorkoutSession | null> {
  const session = await db.getFirstAsync<SessionRow>(
    `SELECT ${SESSION_COLUMNS}
       FROM local_sessions
      WHERE id = ?`,
    sessionId,
  );
  if (!session) return null;
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT e.id, e.session_id, e.slug, e.order_index, e.rest_seconds,
            COALESCE(e.notes, n.notes) AS notes,
            e.machine_id, e.machine_name
       FROM local_session_exercises e
       LEFT JOIN local_exercise_notes n ON n.slug = e.slug
      WHERE e.session_id = ?
      ORDER BY e.order_index`,
    sessionId,
  );
  const exercises = await Promise.all(rows.map((row) => loadExercise(db, row)));
  const starred = await findStarredLocalPlace(db);
  const place =
    (session.place_id ? await getLocalPlace(db, session.place_id) : null) ??
    starred;
  return {
    _id: session.id,
    remoteId: session.remote_id,
    remoteTemplateId: session.remote_template_id,
    status: session.status,
    sessionKind: mapSessionKind(session.session_kind),
    templateId: session.template_id,
    templateName: session.template_name,
    startedAt: session.started_at,
    completedAt: session.completed_at ?? undefined,
    updatedAt: session.updated_at,
    countsTowardGoals: session.counts_toward_goals !== 0,
    health: mapHealthSummary(session),
    placeId: session.place_id ?? place?._id ?? null,
    placeName: session.place_name ?? place?.name ?? null,
    placeStarred: place?.starred ?? true,
    exercises,
  };
}

export type LocalInsightsSession = {
  sessionId: string;
  remoteId: string | null;
  templateId: string | null;
  remoteTemplateId: string | null;
  templateName: string;
  startedAt: number;
  completedAt: number;
  sessionKind: LocalSessionKind;
  countsTowardGoals: boolean;
  health: LocalHealthSummary | null;
  placeId: string | null;
  placeName: string | null;
  exercises: Array<{
    slug: string;
    sets: Array<{
      orderIndex: number;
      weight: number;
      reps: number;
      completed: boolean;
    }>;
  }>;
};

/** Completed local workouts shaped for insights aggregation. */
export async function listLocalCompletedSessions(
  db: SQLiteDatabase,
): Promise<LocalInsightsSession[]> {
  const sessions = await db.getAllAsync<SessionRow>(
    `SELECT ${SESSION_COLUMNS}
       FROM local_sessions
      WHERE status = 'completed'
      ORDER BY COALESCE(completed_at, started_at) DESC`,
  );

  const loaded = await Promise.all(
    sessions.map(async (session) => {
      const exercises = await db.getAllAsync<{
        id: string;
        slug: string;
      }>(
        `SELECT id, slug
           FROM local_session_exercises
          WHERE session_id = ?
          ORDER BY order_index`,
        session.id,
      );
      const withSets = await Promise.all(
        exercises.map(async (exercise) => {
          const sets = await db.getAllAsync<{
            order_index: number;
            weight: number;
            reps: number;
            completed: number;
          }>(
            `SELECT order_index, weight, reps, completed
               FROM local_sets
              WHERE session_exercise_id = ?
              ORDER BY order_index`,
            exercise.id,
          );
          return {
            slug: exercise.slug,
            sets: sets.map((set) => ({
              orderIndex: set.order_index,
              weight: set.weight,
              reps: set.reps,
              completed: set.completed === 1,
            })),
          };
        }),
      );
      const templateName = session.template_name.trim();
      return {
        sessionId: session.id,
        remoteId: session.remote_id,
        templateId: session.template_id,
        remoteTemplateId: session.remote_template_id,
        templateName: templateName.length > 0 ? templateName : "Quick start",
        startedAt: session.started_at,
        completedAt: session.completed_at ?? session.started_at,
        sessionKind: mapSessionKind(session.session_kind),
        countsTowardGoals: session.counts_toward_goals !== 0,
        health: mapHealthSummary(session),
        placeId: session.place_id,
        placeName: session.place_name,
        exercises: withSets,
      } satisfies LocalInsightsSession;
    }),
  );

  return loaded.filter((session) => {
    if (session.sessionKind === "health_summary") return true;
    return session.exercises.some((exercise) =>
      exercise.sets.some((set) => set.completed && set.reps > 0),
    );
  });
}

export async function getLocalActiveWorkout(
  db: SQLiteDatabase,
): Promise<LocalActiveWorkout | null> {
  const row = await db.getFirstAsync<{
    id: string;
    template_id: string | null;
    template_name: string;
    started_at: number;
  }>(
    `SELECT id, template_id, template_name, started_at
       FROM local_sessions
      WHERE status = 'in_progress'
      ORDER BY started_at DESC
      LIMIT 1`,
  );
  return row
    ? {
        _id: row.id,
        templateId: row.template_id,
        templateName: row.template_name,
        startedAt: row.started_at,
      }
    : null;
}

async function snapshotFromSession(
  db: SQLiteDatabase,
  session: LocalWorkoutSession,
): Promise<SessionSyncSnapshot> {
  const place = session.placeId
    ? await getLocalPlace(db, session.placeId)
    : null;
  const exercises = await Promise.all(
    session.exercises.map(async (exercise) => {
      const machine = exercise.machineId
        ? await db.getFirstAsync<{ remote_id: string | null }>(
            `SELECT remote_id FROM local_machines WHERE id = ? OR remote_id = ?`,
            exercise.machineId,
            exercise.machineId,
          )
        : null;
      return {
        clientId: exercise._id,
        slug: exercise.slug,
        orderIndex: exercise.orderIndex,
        restSeconds: exercise.restSeconds,
        notes: exercise.notes ?? null,
        machineId: convexMachineId(
          machine
            ? { _id: exercise.machineId ?? "", remoteId: machine.remote_id }
            : null,
        ),
        machineName: exercise.machineName,
        sets: exercise.sets.map((set) => ({
          clientId: set._id,
          orderIndex: set.orderIndex,
          targetWeight: set.targetWeight,
          targetReps: set.targetReps,
          weight: set.weight,
          reps: set.reps,
          completed: set.completed,
          completedAt: set.completedAt ?? null,
        })),
      };
    }),
  );
  return {
    clientId: session._id,
    remoteTemplateId: session.remoteTemplateId,
    templateName: session.templateName,
    status: session.status,
    sessionKind: session.sessionKind,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? null,
    updatedAt: session.updatedAt,
    countsTowardGoals: session.countsTowardGoals,
    placeId: convexPlaceId(place),
    placeName: session.placeName,
    externalProvider: session.health?.provider ?? null,
    externalId: session.health?.externalId ?? null,
    activityType: session.health?.activityType ?? null,
    sourceName: session.health?.sourceName ?? null,
    sourceBundleId: session.health?.sourceBundleId ?? null,
    durationSeconds: session.health?.durationSeconds ?? null,
    energyKcal: session.health?.energyKcal ?? null,
    distanceMeters: session.health?.distanceMeters ?? null,
    importedAt: session.health?.importedAt ?? null,
    exercises,
  };
}

/** Exported for `backup.ts`, which queues restored rows for a later sign-in. */
export async function queueSessionSnapshot(
  db: SQLiteDatabase,
  sessionId: string,
  createdAt = Date.now(),
) {
  const session = await getLocalWorkout(db, sessionId);
  if (!session) return;
  await db.runAsync(
    `INSERT INTO local_sync_outbox (
       entity_type, entity_id, operation_id, payload_json, created_at, attempt_count
     ) VALUES ('session', ?, ?, ?, ?, 0)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       operation_id = excluded.operation_id,
       payload_json = excluded.payload_json,
       created_at = excluded.created_at,
       attempt_count = 0`,
    sessionId,
    randomUUID(),
    JSON.stringify(await snapshotFromSession(db, session)),
    createdAt,
  );
}

async function markSessionUpdated(
  db: SQLiteDatabase,
  sessionId: string,
  updatedAt = Date.now(),
) {
  await db.runAsync(
    "UPDATE local_sessions SET updated_at = ? WHERE id = ?",
    updatedAt,
    sessionId,
  );
  await queueSessionSnapshot(db, sessionId, updatedAt);
}

async function requireEditableSession(db: SQLiteDatabase, sessionId: string) {
  const session = await db.getFirstAsync<{ status: string }>(
    "SELECT status FROM local_sessions WHERE id = ?",
    sessionId,
  );
  if (!session) throw new Error("Session not found");
  if (session.status !== "in_progress")
    throw new Error("Workout is no longer active");
}

async function sessionIdForExercise(db: SQLiteDatabase, exerciseId: string) {
  const row = await db.getFirstAsync<{ session_id: string }>(
    "SELECT session_id FROM local_session_exercises WHERE id = ?",
    exerciseId,
  );
  if (!row) throw new Error("Exercise not found");
  return row.session_id;
}

async function sessionIdForSet(db: SQLiteDatabase, setId: string) {
  const row = await db.getFirstAsync<{ session_id: string }>(
    `SELECT e.session_id
       FROM local_sets s
       JOIN local_session_exercises e ON e.id = s.session_exercise_id
      WHERE s.id = ?`,
    setId,
  );
  if (!row) throw new Error("Set not found");
  return row.session_id;
}

async function abandonExistingIfAllowed(
  db: SQLiteDatabase,
  abandonExisting: boolean,
  now: number,
) {
  const active = await getLocalActiveWorkout(db);
  if (!active) return;
  if (!abandonExisting) throw new Error("ACTIVE_SESSION_EXISTS");
  await db.runAsync(
    `UPDATE local_sessions
        SET status = 'abandoned', updated_at = ?
      WHERE id = ?`,
    now,
    active._id,
  );
  await queueSessionSnapshot(db, active._id, now);
}

export async function startLocalBlankWorkout(
  db: SQLiteDatabase,
  abandonExisting = false,
  placeId?: string | null,
) {
  const now = Date.now();
  await abandonExistingIfAllowed(db, abandonExisting, now);
  const place = await resolveLocalPlaceForStart(db, {
    placeId,
    blank: true,
  });
  const sessionId = randomUUID();
  await db.runAsync(
    `INSERT INTO local_sessions (
       id, template_name, status, started_at, updated_at, place_id, place_name
     ) VALUES (?, 'Quick start', 'in_progress', ?, ?, ?, ?)`,
    sessionId,
    now,
    now,
    place._id,
    place.name,
  );
  await queueSessionSnapshot(db, sessionId, now);
  return sessionId;
}

export async function startLocalTemplateWorkout(
  db: SQLiteDatabase,
  templateId: string,
  abandonExisting = false,
  placeId?: string | null,
) {
  const template = await getLocalTemplate(db, templateId);
  if (!template) throw new Error("Template is not available offline yet");
  const now = Date.now();
  await abandonExistingIfAllowed(db, abandonExisting, now);
  const place = await resolveLocalPlaceForStart(db, {
    placeId,
    templateLastPlaceId: template.lastPlaceId,
  });
  const sessionId = randomUUID();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO local_sessions (
         id, template_id, remote_template_id, template_name, status,
         started_at, updated_at, place_id, place_name
       ) VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?, ?)`,
      sessionId,
      template._id,
      // A template that has not synced yet only has a `local:` placeholder, and
      // `pushSession` rejects anything that is not a real Convex id. Stay NULL
      // until `completeTemplateSync` backfills the durable one.
      isUnsyncedTemplateRemoteId(template.remoteId) ? null : template.remoteId,
      template.name,
      now,
      now,
      place._id,
      place.name,
    );
    for (const exercise of template.exercises) {
      const machine = await lastLocalMachineForLift(
        txn,
        place._id,
        exercise.slug,
      );
      const memory = await getLocalWorkingSets(txn, {
        placeId: place._id,
        exerciseSlug: exercise.slug,
        machineId: machine?._id,
      });
      const seeded = seedLocalSetRows(exercise.sets, memory);
      const exerciseId = randomUUID();
      await txn.runAsync(
        `INSERT INTO local_session_exercises (
           id, session_id, slug, order_index, rest_seconds,
           machine_id, machine_name
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        exerciseId,
        sessionId,
        exercise.slug,
        exercise.orderIndex,
        DEFAULT_REST_SECONDS,
        machine?._id ?? null,
        machine?.name ?? null,
      );
      for (let index = 0; index < seeded.length; index++) {
        const set = seeded[index];
        await txn.runAsync(
          `INSERT INTO local_sets (
             id, session_exercise_id, order_index, target_weight,
             target_reps, weight, reps, completed
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          randomUUID(),
          exerciseId,
          index,
          set.weight,
          set.reps,
          set.weight,
          set.reps,
        );
      }
    }
  });
  await queueSessionSnapshot(db, sessionId, now);
  return sessionId;
}

export async function setLocalSessionPlace(
  db: SQLiteDatabase,
  sessionId: string,
  placeId: string,
) {
  await requireEditableSession(db, sessionId);
  const result = await reseedLocalSessionToPlace(db, sessionId, placeId);
  await markSessionUpdated(db, sessionId);
  return result;
}

export async function setLocalSessionMachine(
  db: SQLiteDatabase,
  sessionExerciseId: string,
  machineId: string,
) {
  const sessionId = await sessionIdForExercise(db, sessionExerciseId);
  await requireEditableSession(db, sessionId);
  await assignLocalSessionMachine(db, sessionExerciseId, machineId);
  await markSessionUpdated(db, sessionId);
}

export async function updateLocalSet(
  db: SQLiteDatabase,
  setId: string,
  values: { weight?: number; reps?: number; completed?: boolean },
) {
  const sessionId = await sessionIdForSet(db, setId);
  await requireEditableSession(db, sessionId);
  const fields: string[] = [];
  const params: Array<string | number | null> = [];
  if (values.weight !== undefined) {
    fields.push("weight = ?");
    params.push(boundedWhole(values.weight, MAX_WEIGHT, "Weight"));
  }
  if (values.reps !== undefined) {
    fields.push("reps = ?");
    params.push(boundedWhole(values.reps, MAX_REPS, "Reps"));
  }
  if (values.completed !== undefined) {
    fields.push("completed = ?", "completed_at = ?");
    params.push(values.completed ? 1 : 0, values.completed ? Date.now() : null);
  }
  if (!fields.length) return;
  params.push(setId);
  await db.runAsync(
    `UPDATE local_sets SET ${fields.join(", ")} WHERE id = ?`,
    params,
  );
  await markSessionUpdated(db, sessionId);
}

export async function addLocalSet(
  db: SQLiteDatabase,
  sessionExerciseId: string,
) {
  const sessionId = await sessionIdForExercise(db, sessionExerciseId);
  await requireEditableSession(db, sessionId);
  const sets = await db.getAllAsync<SetRow>(
    `SELECT id, session_exercise_id, order_index, target_weight, target_reps,
            weight, reps, completed, completed_at
       FROM local_sets
      WHERE session_exercise_id = ?
      ORDER BY order_index`,
    sessionExerciseId,
  );
  if (sets.length >= MAX_SETS)
    throw new Error(`Exercises can contain at most ${MAX_SETS} sets`);
  const last = sets.at(-1);
  const setId = randomUUID();
  await db.runAsync(
    `INSERT INTO local_sets (
       id, session_exercise_id, order_index, target_weight, target_reps,
       weight, reps, completed
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    setId,
    sessionExerciseId,
    (last?.order_index ?? -1) + 1,
    last?.target_weight ?? last?.weight ?? 0,
    last?.target_reps ?? last?.reps ?? 0,
    last?.weight ?? 0,
    last?.reps ?? 0,
  );
  await markSessionUpdated(db, sessionId);
  return setId;
}

export async function deleteLocalSet(db: SQLiteDatabase, setId: string) {
  const row = await db.getFirstAsync<{
    session_exercise_id: string;
    session_id: string;
  }>(
    `SELECT s.session_exercise_id, e.session_id
       FROM local_sets s
       JOIN local_session_exercises e ON e.id = s.session_exercise_id
      WHERE s.id = ?`,
    setId,
  );
  if (!row) throw new Error("Set not found");
  await requireEditableSession(db, row.session_id);
  const sets = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM local_sets
      WHERE session_exercise_id = ?
      ORDER BY order_index`,
    row.session_exercise_id,
  );
  if (sets.length <= 1) throw new Error("Cannot delete the last set");
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("DELETE FROM local_sets WHERE id = ?", setId);
    const remaining = sets.filter((set) => set.id !== setId);
    for (let index = 0; index < remaining.length; index++) {
      await txn.runAsync(
        "UPDATE local_sets SET order_index = ? WHERE id = ?",
        index,
        remaining[index].id,
      );
    }
  });
  await markSessionUpdated(db, row.session_id);
}

export async function addLocalExercise(
  db: SQLiteDatabase,
  sessionId: string,
  value: string,
  presets?: { weight: number; reps: number }[],
) {
  await requireEditableSession(db, sessionId);
  const slug = normalizedSlug(value);
  const exercises = await db.getAllAsync<{
    id: string;
    slug: string;
    order_index: number;
  }>(
    `SELECT id, slug, order_index
       FROM local_session_exercises
      WHERE session_id = ?
      ORDER BY order_index`,
    sessionId,
  );
  if (exercises.length >= MAX_EXERCISES)
    throw new Error(`Workouts can contain at most ${MAX_EXERCISES} exercises`);
  if (exercises.some((exercise) => exercise.slug === slug))
    throw new Error("Exercise already in workout");

  const sessionRow = await db.getFirstAsync<{
    place_id: string | null;
  }>(`SELECT place_id FROM local_sessions WHERE id = ?`, sessionId);
  const placeId = sessionRow?.place_id ?? (await ensureLocalHomePlace(db))._id;
  const machine = await lastLocalMachineForLift(db, placeId, slug);
  const memory = await getLocalWorkingSets(db, {
    placeId,
    exerciseSlug: slug,
    machineId: machine?._id,
  });
  const previous = memory?.[0] ??
    (await getLastLocalSet(db, slug, { placeId, machineId: machine?._id })) ?? {
      weight: 0,
      reps: 0,
    };
  const seed = previous;
  const rows = setRowsForNewExercise(presets, seed);
  const exerciseId = randomUUID();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO local_session_exercises (
         id, session_id, slug, order_index, rest_seconds,
         machine_id, machine_name
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      exerciseId,
      sessionId,
      slug,
      exercises.length,
      DEFAULT_REST_SECONDS,
      machine?._id ?? null,
      machine?.name ?? null,
    );
    for (let index = 0; index < rows.length; index++) {
      const weight = boundedWhole(rows[index]!.weight, MAX_WEIGHT, "Weight");
      const reps = boundedWhole(rows[index]!.reps, MAX_REPS, "Reps");
      await txn.runAsync(
        `INSERT INTO local_sets (
           id, session_exercise_id, order_index, target_weight, target_reps,
           weight, reps, completed
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        randomUUID(),
        exerciseId,
        index,
        weight,
        reps,
        weight,
        reps,
      );
    }
  });
  await markSessionUpdated(db, sessionId);
  return exerciseId;
}

export async function removeLocalExercise(
  db: SQLiteDatabase,
  sessionExerciseId: string,
) {
  const sessionId = await sessionIdForExercise(db, sessionExerciseId);
  await requireEditableSession(db, sessionId);
  await db.runAsync(
    "DELETE FROM local_session_exercises WHERE id = ?",
    sessionExerciseId,
  );
  const remaining = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM local_session_exercises
      WHERE session_id = ?
      ORDER BY order_index`,
    sessionId,
  );
  for (let index = 0; index < remaining.length; index++) {
    await db.runAsync(
      "UPDATE local_session_exercises SET order_index = ? WHERE id = ?",
      index,
      remaining[index].id,
    );
  }
  await markSessionUpdated(db, sessionId);
}

export async function moveLocalExercise(
  db: SQLiteDatabase,
  sessionExerciseId: string,
  delta: -1 | 1,
) {
  const sessionId = await sessionIdForExercise(db, sessionExerciseId);
  await requireEditableSession(db, sessionId);
  const rows = await db.getAllAsync<{ id: string; order_index: number }>(
    `SELECT id, order_index FROM local_session_exercises
      WHERE session_id = ?
      ORDER BY order_index`,
    sessionId,
  );
  const index = rows.findIndex((row) => row.id === sessionExerciseId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= rows.length) return;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      "UPDATE local_session_exercises SET order_index = ? WHERE id = ?",
      rows[target].order_index,
      rows[index].id,
    );
    await txn.runAsync(
      "UPDATE local_session_exercises SET order_index = ? WHERE id = ?",
      rows[index].order_index,
      rows[target].id,
    );
  });
  await markSessionUpdated(db, sessionId);
}

export async function saveLocalExerciseNote(
  db: SQLiteDatabase,
  slug: string,
  notes: string,
) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO local_exercise_notes (slug, notes, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       notes = excluded.notes,
       updated_at = excluded.updated_at`,
    normalizedSlug(slug),
    notes.trim(),
    now,
  );
  const active = await db.getAllAsync<{ session_id: string }>(
    `SELECT DISTINCT e.session_id
       FROM local_session_exercises e
       JOIN local_sessions s ON s.id = e.session_id
      WHERE e.slug = ? AND s.status = 'in_progress'`,
    slug,
  );
  for (const session of active)
    await markSessionUpdated(db, session.session_id, now);
}

export async function finishLocalWorkout(
  db: SQLiteDatabase,
  sessionId: string,
) {
  await requireEditableSession(db, sessionId);
  const now = Date.now();
  await db.runAsync(
    `UPDATE local_sessions
        SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ?`,
    now,
    now,
    sessionId,
  );
  await recordLocalSessionPlaceMemory(db, sessionId);
  await queueSessionSnapshot(db, sessionId, now);
}

export async function abandonLocalWorkout(
  db: SQLiteDatabase,
  sessionId: string,
) {
  await requireEditableSession(db, sessionId);
  const now = Date.now();
  await db.runAsync(
    `UPDATE local_sessions
        SET status = 'abandoned', updated_at = ?
      WHERE id = ?`,
    now,
    sessionId,
  );
  await queueSessionSnapshot(db, sessionId, now);
}

export async function deleteLocalWorkout(
  db: SQLiteDatabase,
  sessionId: string,
) {
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM local_sessions WHERE id = ?`,
    sessionId,
  );
  if (!row) return;
  if (row.status === "in_progress")
    throw new Error("Cannot delete an active workout");
  const now = Date.now();
  const deleteSnapshot: SessionDeleteSnapshot = {
    clientId: row.id,
    remoteId: row.remote_id,
    externalProvider:
      row.external_provider === "apple_health" ? "apple_health" : null,
    externalId: row.external_id,
  };
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `DELETE FROM local_sync_outbox
        WHERE entity_type = 'session' AND entity_id = ?`,
      sessionId,
    );
    await txn.runAsync(
      `INSERT INTO local_sync_outbox (
         entity_type, entity_id, operation_id, payload_json, created_at, attempt_count
       ) VALUES ('session_delete', ?, ?, ?, ?, 0)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         operation_id = excluded.operation_id,
         payload_json = excluded.payload_json,
         created_at = excluded.created_at,
         attempt_count = 0`,
      sessionId,
      randomUUID(),
      JSON.stringify(deleteSnapshot),
      now,
    );
    await txn.runAsync("DELETE FROM local_sessions WHERE id = ?", sessionId);
  });
}

export async function getLocalTemplate(
  db: SQLiteDatabase,
  templateId: string,
): Promise<LocalTemplate | null> {
  const template = await db.getFirstAsync<TemplateRow>(
    `SELECT id, remote_id, name, updated_at, last_place_id
       FROM local_templates
      WHERE id = ? OR remote_id = ?
      LIMIT 1`,
    templateId,
    templateId,
  );
  if (!template) return null;
  const exercises = await db.getAllAsync<TemplateExerciseRow>(
    `SELECT slug, order_index, sets_json
       FROM local_template_exercises
      WHERE template_id = ?
      ORDER BY order_index`,
    template.id,
  );
  return {
    _id: template.id,
    remoteId: template.remote_id,
    name: template.name,
    updatedAt: template.updated_at,
    lastPlaceId: template.last_place_id,
    exercises: exercises.map((exercise) => ({
      slug: exercise.slug,
      orderIndex: exercise.order_index,
      sets: JSON.parse(exercise.sets_json) as Array<{
        weight: number;
        reps: number;
      }>,
    })),
  };
}

export async function getLocalTemplates(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM local_templates ORDER BY updated_at DESC",
  );
  const templates = await Promise.all(
    rows.map((row) => getLocalTemplate(db, row.id)),
  );
  return templates.filter((template): template is LocalTemplate =>
    Boolean(template),
  );
}

export async function saveLocalTemplate(
  db: SQLiteDatabase,
  input: {
    templateId?: string;
    name: string;
    exercises: Array<{
      slug: string;
      sets: Array<{ weight: number; reps: number }>;
    }>;
  },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Template name is required");
  if (!input.exercises.length) throw new Error("Add at least one exercise");
  if (input.exercises.length > MAX_EXERCISES) {
    throw new Error(`Templates support up to ${MAX_EXERCISES} exercises`);
  }

  const existing = input.templateId
    ? await getLocalTemplate(db, input.templateId)
    : null;
  const templateId = existing?._id ?? input.templateId ?? randomUUID();
  const remoteId =
    existing?.remoteId ??
    (input.templateId && !isUnsyncedTemplateRemoteId(input.templateId)
      ? input.templateId
      : localTemplateRemoteId(templateId));
  const now = Date.now();
  const exercises = input.exercises.map((exercise, orderIndex) => {
    const slug = normalizedSlug(exercise.slug);
    if (exercise.sets.length > MAX_SETS) {
      throw new Error(`Each exercise supports up to ${MAX_SETS} sets`);
    }
    return {
      slug,
      orderIndex,
      sets: exercise.sets.map((set) => ({
        weight: boundedWhole(set.weight, MAX_WEIGHT, "Weight"),
        reps: boundedWhole(set.reps, MAX_REPS, "Reps"),
      })),
    };
  });

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO local_templates (id, remote_id, name, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         updated_at = excluded.updated_at`,
      templateId,
      remoteId,
      name,
      now,
    );
    await txn.runAsync(
      "DELETE FROM local_template_exercises WHERE template_id = ?",
      templateId,
    );
    for (const exercise of exercises) {
      await txn.runAsync(
        `INSERT INTO local_template_exercises (
           id, template_id, slug, order_index, sets_json
         ) VALUES (?, ?, ?, ?, ?)`,
        randomUUID(),
        templateId,
        exercise.slug,
        exercise.orderIndex,
        JSON.stringify(exercise.sets),
      );
    }
  });

  await queueTemplateSnapshot(db, templateId, now);
  return templateId;
}

/** `Push Day` + an existing `Push Day` becomes `Push Day (2)`. */
function uniqueImportName(name: string, taken: Set<string>): string {
  const base = name.trim() || "Untitled";
  if (!taken.has(base.toLowerCase())) {
    taken.add(base.toLowerCase());
    return base;
  }
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
  return `${base} (${Date.now()})`;
}

export type LocalImportResult = {
  templateIds: string[];
  templatesImported: number;
  customExercisesCreated: number;
  notesImported: number;
  names: string[];
};

/**
 * Write a portable bundle into local SQLite. Mirrors the server import:
 * additive only, name collisions get a `(2)` suffix, custom lifts match by
 * name (reviving archived ones), and notes only fill empty gaps.
 *
 * New rows queue into the sync outbox, so a later sign-in uploads them.
 */
export async function importLocalBundle(
  db: SQLiteDatabase,
  bundle: WorkoutExportBundle,
  options: { includeNotes?: boolean } = {},
): Promise<LocalImportResult> {
  const { includeNotes = true } = options;

  if (bundle.templates.length === 0) {
    throw new Error("This export contains no templates");
  }
  if (bundle.templates.length > MAX_TEMPLATES_PER_IMPORT) {
    throw new Error(
      `Imports are limited to ${MAX_TEMPLATES_PER_IMPORT} templates at a time`,
    );
  }

  const preferences = await getLocalPreferences(db);
  const targetUnit = preferences.unit;
  const existingCustoms = await listLocalCustomExercises(db);
  const customsBefore = existingCustoms.length;
  const byName = new Map(
    existingCustoms.map((exercise) => [
      exercise.name.trim().toLowerCase(),
      exercise,
    ]),
  );
  const slugMap = new Map<string, string>();
  let customCount = existingCustoms.length;

  for (const entry of bundle.customExercises) {
    const name = entry.name.trim().slice(0, MAX_CUSTOM_NAME_LENGTH);
    if (!name) continue;

    const match = byName.get(name.toLowerCase());
    if (match) {
      if (match.archived) {
        const now = Date.now();
        await db.runAsync(
          "UPDATE local_custom_exercises SET archived = 0, updated_at = ? WHERE id = ?",
          now,
          match._id,
        );
        await queueCustomExerciseSnapshot(db, match._id, now);
        match.archived = false;
      }
      slugMap.set(entry.slug, match.slug);
      continue;
    }

    if (customCount >= MAX_CUSTOM_EXERCISES) {
      throw new Error(
        `This import would exceed the limit of ${MAX_CUSTOM_EXERCISES} custom exercises`,
      );
    }

    const created = await saveLocalCustomExercise(db, {
      name,
      short: entry.short,
      category: entry.category,
      usesBar: entry.usesBar,
    });
    customCount++;
    byName.set(name.toLowerCase(), created);
    slugMap.set(entry.slug, created.slug);
  }

  const orphanCache = new Map<string, string>();
  async function resolveCustomSlug(
    senderSlug: string,
    displayName: string,
  ): Promise<string | null> {
    const mapped = slugMap.get(senderSlug);
    if (mapped) return mapped;

    const trimmed = displayName.trim().slice(0, MAX_CUSTOM_NAME_LENGTH);
    if (!trimmed || trimmed.startsWith(CUSTOM_SLUG_PREFIX)) return null;

    const key = trimmed.toLowerCase();
    const cached = orphanCache.get(key);
    if (cached) return cached;

    const match = byName.get(key);
    if (match) {
      if (match.archived) {
        const now = Date.now();
        await db.runAsync(
          "UPDATE local_custom_exercises SET archived = 0, updated_at = ? WHERE id = ?",
          now,
          match._id,
        );
        await queueCustomExerciseSnapshot(db, match._id, now);
        match.archived = false;
      }
      orphanCache.set(key, match.slug);
      return match.slug;
    }

    if (customCount >= MAX_CUSTOM_EXERCISES) {
      throw new Error(
        `This import would exceed the limit of ${MAX_CUSTOM_EXERCISES} custom exercises`,
      );
    }

    const created = await saveLocalCustomExercise(db, {
      name: trimmed,
      category: ORPHAN_FALLBACK_CATEGORY,
      usesBar: false,
    });
    customCount++;
    byName.set(key, created);
    orphanCache.set(key, created.slug);
    return created.slug;
  }

  const existingTemplates = await getLocalTemplates(db);
  const takenNames = new Set(
    existingTemplates.map((template) => template.name.trim().toLowerCase()),
  );

  const templateIds: string[] = [];
  const names: string[] = [];
  const notesToWrite = new Map<string, string>();

  for (const template of bundle.templates) {
    const exercises: Array<{
      slug: string;
      sets: Array<{ weight: number; reps: number }>;
    }> = [];

    for (const exercise of template.exercises) {
      let slug = exercise.slug.trim();
      if (!slug) continue;

      if (slug.startsWith(CUSTOM_SLUG_PREFIX)) {
        const mapped = await resolveCustomSlug(slug, exercise.name);
        if (!mapped) continue;
        slug = mapped;
      }

      exercises.push({
        slug,
        sets: exercise.sets.map((set) => ({
          weight: convertWeight(set.weight, bundle.unit, targetUnit),
          reps: set.reps,
        })),
      });

      const note = exercise.notes?.trim();
      if (includeNotes && note) notesToWrite.set(slug, note);
    }

    if (exercises.length === 0) continue;

    const name = uniqueImportName(template.name, takenNames);
    const templateId = await saveLocalTemplate(db, { name, exercises });
    templateIds.push(templateId);
    names.push(name);
  }

  if (templateIds.length === 0) {
    throw new Error("This export contains no usable exercises");
  }

  let notesImported = 0;
  if (includeNotes && notesToWrite.size > 0) {
    for (const [slug, notes] of notesToWrite) {
      const existing = await db.getFirstAsync<{ notes: string }>(
        "SELECT notes FROM local_exercise_notes WHERE slug = ?",
        normalizedSlug(slug),
      );
      if (existing?.notes?.trim()) continue;
      await saveLocalExerciseNote(db, slug, notes.slice(0, 500));
      notesImported++;
    }
  }

  const customsAfter = await listLocalCustomExercises(db);
  return {
    templateIds,
    templatesImported: templateIds.length,
    customExercisesCreated: customsAfter.length - customsBefore,
    notesImported,
    names,
  };
}

/**
 * Logged rows as template presets. Mirrors the server's `normalizeTemplateSets`:
 * an exercise always keeps at least one set row.
 */
function templateSetsFromSession(
  sets: Array<{ weight: number; reps: number }>,
): Array<{ weight: number; reps: number }> {
  const cleaned = sets.map((set) => ({
    weight: boundedWhole(set.weight, MAX_WEIGHT, "Weight"),
    reps: boundedWhole(set.reps, MAX_REPS, "Reps"),
  }));
  return cleaned.length ? cleaned : [{ weight: 0, reps: 0 }];
}

/**
 * True when what was logged differs from the template's presets, for any
 * exercise still on the template. Every logged row counts, checked or not —
 * the checkmark is a progress aid, and the write-back stores them all.
 * Mirrors `templateDiffersFromSession` in the web finish flow.
 */
export function localTemplateDiffersFromSession(
  session: LocalWorkoutSession,
  template: LocalTemplate | null,
): boolean {
  if (!template) return false;

  const sessionSlugs = session.exercises.map((exercise) => exercise.slug);
  const templateSlugs = template.exercises.map((exercise) => exercise.slug);
  if (sessionSlugs.length !== templateSlugs.length) return true;
  if (sessionSlugs.some((slug, index) => slug !== templateSlugs[index]))
    return true;

  const bySlug = new Map(
    template.exercises.map((exercise) => [exercise.slug, exercise.sets]),
  );
  for (const exercise of session.exercises) {
    const preset = bySlug.get(exercise.slug);
    if (!preset) continue;
    if (
      exercise.sets.length !== preset.length ||
      exercise.sets.some(
        (set, index) =>
          set.weight !== preset[index].weight ||
          set.reps !== preset[index].reps,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** Convenience for the finish flow: does this session's template need updating? */
export async function localSessionTemplateDiffers(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<boolean> {
  const session = await getLocalWorkout(db, sessionId);
  if (!session?.templateId) return false;
  const template = await getLocalTemplate(db, session.templateId);
  return localTemplateDiffersFromSession(session, template);
}

/**
 * Push today's numbers back onto the template this session came from. Exercises
 * dropped from the session keep their presets and move to the end, matching
 * `templates.mutations.syncFromSession` on the server.
 */
export async function syncLocalTemplateFromSession(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<void> {
  const session = await getLocalWorkout(db, sessionId);
  if (!session) throw new Error("Session not found");
  if (!session.templateId) throw new Error("Session has no template");
  const template = await getLocalTemplate(db, session.templateId);
  if (!template) throw new Error("Template not found");

  const sessionSlugs = new Set(
    session.exercises.map((exercise) => exercise.slug),
  );
  const exercises = session.exercises.map((exercise) => ({
    slug: exercise.slug,
    sets: templateSetsFromSession(exercise.sets),
  }));
  for (const exercise of template.exercises) {
    if (sessionSlugs.has(exercise.slug)) continue;
    exercises.push({ slug: exercise.slug, sets: exercise.sets });
  }

  await saveLocalTemplate(db, {
    templateId: template._id,
    name: template.name,
    exercises,
  });
}

/**
 * Turn a finished quick-start session into a reusable template and link the two,
 * like `templates.mutations.createFromSession`. `remote_template_id` stays NULL
 * until the template itself reaches Convex — the session validator only accepts
 * a real Convex id, so `completeTemplateSync` backfills it.
 */
export async function createLocalTemplateFromSession(
  db: SQLiteDatabase,
  sessionId: string,
  name: string,
): Promise<string> {
  const session = await getLocalWorkout(db, sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "completed")
    throw new Error("Only completed workouts can be saved as templates");
  if (session.templateId) throw new Error("Workout already has a template");
  if (!session.exercises.length)
    throw new Error("Add at least one exercise before saving a template");

  const templateId = await saveLocalTemplate(db, {
    name,
    exercises: session.exercises.map((exercise) => ({
      slug: exercise.slug,
      sets: templateSetsFromSession(exercise.sets),
    })),
  });

  const now = Date.now();
  await db.runAsync(
    `UPDATE local_sessions
        SET template_id = ?, template_name = ?, updated_at = ?
      WHERE id = ?`,
    templateId,
    name.trim(),
    now,
    sessionId,
  );
  await queueSessionSnapshot(db, sessionId, now);
  return templateId;
}

/** Exported for `backup.ts` — see `queueSessionSnapshot`. */
export async function queueTemplateSnapshot(
  db: SQLiteDatabase,
  templateId: string,
  now: number,
) {
  const template = await getLocalTemplate(db, templateId);
  if (!template) return;
  await db.runAsync(
    `INSERT INTO local_sync_outbox (
       entity_type, entity_id, operation_id, payload_json, created_at, attempt_count
     ) VALUES ('template', ?, ?, ?, ?, 0)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       operation_id = excluded.operation_id,
       payload_json = excluded.payload_json,
       created_at = excluded.created_at,
       attempt_count = 0`,
    templateId,
    randomUUID(),
    JSON.stringify({
      localId: template._id,
      remoteId: isUnsyncedTemplateRemoteId(template.remoteId)
        ? null
        : template.remoteId,
      name: template.name,
      updatedAt: template.updatedAt,
      exercises: template.exercises.map((exercise) => ({
        slug: exercise.slug,
        sets: exercise.sets,
      })),
    }),
    now,
  );
}

export async function setLocalTemplateRemoteId(
  db: SQLiteDatabase,
  templateId: string,
  remoteId: string,
) {
  await db.runAsync(
    "UPDATE local_templates SET remote_id = ? WHERE id = ?",
    remoteId,
    templateId,
  );
}

export type PendingTemplateSync = {
  operationId: string;
  templateId: string;
  snapshot: {
    localId: string;
    remoteId: string | null;
    name: string;
    updatedAt: number;
    exercises: Array<{
      slug: string;
      sets: Array<{ weight: number; reps: number }>;
    }>;
  };
  createdAt: number;
  attemptCount: number;
};

export async function getPendingTemplateSync(
  db: SQLiteDatabase,
): Promise<PendingTemplateSync | null> {
  const row = await db.getFirstAsync<{
    operation_id: string;
    entity_id: string;
    payload_json: string;
    created_at: number;
    attempt_count: number;
  }>(
    `SELECT operation_id, entity_id, payload_json, created_at, attempt_count
       FROM local_sync_outbox
      WHERE entity_type = 'template'
      ORDER BY created_at
      LIMIT 1`,
  );
  if (!row) return null;
  return {
    operationId: row.operation_id,
    templateId: row.entity_id,
    snapshot: JSON.parse(row.payload_json) as PendingTemplateSync["snapshot"],
    createdAt: row.created_at,
    attemptCount: row.attempt_count,
  };
}

export async function noteTemplateSyncAttempt(
  db: SQLiteDatabase,
  operationId: string,
) {
  await db.runAsync(
    `UPDATE local_sync_outbox
        SET attempt_count = attempt_count + 1
      WHERE operation_id = ?`,
    operationId,
  );
}

export async function completeTemplateSync(
  db: SQLiteDatabase,
  operationId: string,
  templateId: string,
  remoteTemplateId: string | null,
) {
  // Sessions attached to a template that had not reached Convex yet carry no
  // remote template id, because `pushSession` only accepts a real Convex id.
  // Now that one exists, adopt it and re-upload so the link lands server-side.
  const relinked = remoteTemplateId
    ? await db.getAllAsync<{ id: string }>(
        `SELECT id FROM local_sessions
          WHERE template_id = ? AND remote_template_id IS NOT ?`,
        templateId,
        remoteTemplateId,
      )
    : [];
  const now = Date.now();

  await db.withExclusiveTransactionAsync(async (txn) => {
    if (remoteTemplateId) {
      await txn.runAsync(
        "UPDATE local_templates SET remote_id = ? WHERE id = ?",
        remoteTemplateId,
        templateId,
      );
      await txn.runAsync(
        `UPDATE local_sessions
            SET remote_template_id = ?, updated_at = ?
          WHERE template_id = ? AND remote_template_id IS NOT ?`,
        remoteTemplateId,
        now,
        templateId,
        remoteTemplateId,
      );
    }
    await txn.runAsync(
      "DELETE FROM local_sync_outbox WHERE operation_id = ?",
      operationId,
    );
  });

  for (const row of relinked) await queueSessionSnapshot(db, row.id, now);
}

export async function deleteLocalTemplate(
  db: SQLiteDatabase,
  templateId: string,
): Promise<LocalTemplate | null> {
  const existing = await getLocalTemplate(db, templateId);
  if (!existing) return null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      "DELETE FROM local_template_exercises WHERE template_id = ?",
      existing._id,
    );
    await txn.runAsync(
      "DELETE FROM local_templates WHERE id = ?",
      existing._id,
    );
    await txn.runAsync(
      `DELETE FROM local_sync_outbox
        WHERE entity_type = 'template' AND entity_id = ?`,
      existing._id,
    );
  });
  return existing;
}

export async function getLocalExerciseNotes(
  db: SQLiteDatabase,
  slugs: string[],
): Promise<Record<string, string>> {
  if (!slugs.length) return {};
  const notes: Record<string, string> = {};
  for (const slug of slugs) {
    const row = await db.getFirstAsync<{ notes: string }>(
      "SELECT notes FROM local_exercise_notes WHERE slug = ?",
      normalizedSlug(slug),
    );
    if (row?.notes) notes[slug] = row.notes;
  }
  return notes;
}

type CustomExerciseRow = {
  id: string;
  slug: string;
  remote_id: string | null;
  name: string;
  short: string | null;
  category: string;
  uses_bar: number;
  archived: number;
  updated_at: number;
};

function mapCustomExercise(row: CustomExerciseRow): LocalCustomExercise {
  return {
    _id: row.id,
    slug: row.slug,
    remoteId: row.remote_id,
    name: row.name,
    short: row.short,
    category: row.category as LocalMuscleGroup,
    usesBar: row.uses_bar === 1,
    archived: row.archived === 1,
    updatedAt: row.updated_at,
  };
}

function normalizedCustomName(value: string) {
  const name = value.trim();
  if (!name) throw new Error("Exercise name is required");
  if (name.length > MAX_CUSTOM_NAME_LENGTH)
    throw new Error(
      `Exercise name must be at most ${MAX_CUSTOM_NAME_LENGTH} characters`,
    );
  return name;
}

function normalizedMuscleGroup(value: string): LocalMuscleGroup {
  const group = MUSCLE_GROUPS.find((candidate) => candidate === value);
  if (!group) throw new Error(`Unknown muscle group: ${value}`);
  return group;
}

/**
 * Every custom lift known to this device, archived ones included — the catalog
 * needs them so historic sessions still resolve a name.
 */
export async function listLocalCustomExercises(
  db: SQLiteDatabase,
): Promise<LocalCustomExercise[]> {
  const rows = await db.getAllAsync<CustomExerciseRow>(
    `SELECT id, slug, remote_id, name, short, category, uses_bar, archived,
            updated_at
       FROM local_custom_exercises
      ORDER BY name COLLATE NOCASE`,
  );
  return rows.map(mapCustomExercise);
}

/** Exported for `backup.ts` — see `queueSessionSnapshot`. */
export async function queueCustomExerciseSnapshot(
  db: SQLiteDatabase,
  exerciseId: string,
  now: number,
) {
  const row = await db.getFirstAsync<CustomExerciseRow>(
    `SELECT id, slug, remote_id, name, short, category, uses_bar, archived,
            updated_at
       FROM local_custom_exercises
      WHERE id = ?`,
    exerciseId,
  );
  if (!row) return;
  const snapshot: CustomExerciseSyncSnapshot = {
    // The local row id doubles as the client id, so a retried upload resolves
    // to the same Convex document instead of duplicating the lift.
    clientId: row.id,
    name: row.name,
    short: row.short,
    category: row.category as LocalMuscleGroup,
    usesBar: row.uses_bar === 1,
    archived: row.archived === 1,
  };
  await db.runAsync(
    `INSERT INTO local_sync_outbox (
       entity_type, entity_id, operation_id, payload_json, created_at, attempt_count
     ) VALUES ('custom_exercise', ?, ?, ?, ?, 0)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       operation_id = excluded.operation_id,
       payload_json = excluded.payload_json,
       created_at = excluded.created_at,
       attempt_count = 0`,
    exerciseId,
    randomUUID(),
    JSON.stringify(snapshot),
    now,
  );
}

/** Create or edit a custom lift. Works with no connection; upload is queued. */
export async function saveLocalCustomExercise(
  db: SQLiteDatabase,
  input: {
    exerciseId?: string;
    name: string;
    short?: string;
    category: string;
    usesBar: boolean;
  },
): Promise<LocalCustomExercise> {
  const name = normalizedCustomName(input.name);
  const short = input.short?.trim()
    ? input.short.trim().slice(0, MAX_CUSTOM_NAME_LENGTH)
    : null;
  const category = normalizedMuscleGroup(input.category);
  const now = Date.now();
  const exerciseId = input.exerciseId ?? randomUUID();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ id: string; slug: string }>(
      "SELECT id, slug FROM local_custom_exercises WHERE id = ?",
      exerciseId,
    );
    if (existing) {
      await txn.runAsync(
        `UPDATE local_custom_exercises
            SET name = ?, short = ?, category = ?, uses_bar = ?, updated_at = ?
          WHERE id = ?`,
        name,
        short,
        category,
        input.usesBar ? 1 : 0,
        now,
        exerciseId,
      );
      return;
    }

    const { count } = (await txn.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM local_custom_exercises",
    )) ?? { count: 0 };
    if (count >= MAX_CUSTOM_EXERCISES)
      throw new Error(
        `At most ${MAX_CUSTOM_EXERCISES} custom exercises are allowed`,
      );

    await txn.runAsync(
      `INSERT INTO local_custom_exercises (
         id, slug, remote_id, name, short, category, uses_bar, archived, updated_at
       ) VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?)`,
      exerciseId,
      normalizedSlug(localCustomSlug(exerciseId)),
      name,
      short,
      category,
      input.usesBar ? 1 : 0,
      now,
    );
  });

  await queueCustomExerciseSnapshot(db, exerciseId, now);
  const saved = await db.getFirstAsync<CustomExerciseRow>(
    `SELECT id, slug, remote_id, name, short, category, uses_bar, archived,
            updated_at
       FROM local_custom_exercises
      WHERE id = ?`,
    exerciseId,
  );
  if (!saved) throw new Error("Custom exercise could not be saved");
  return mapCustomExercise(saved);
}

/**
 * Soft-delete: the lift leaves the pickers but stays resolvable so previous
 * workouts keep rendering its name.
 */
export async function archiveLocalCustomExercise(
  db: SQLiteDatabase,
  exerciseId: string,
) {
  const now = Date.now();
  await db.runAsync(
    "UPDATE local_custom_exercises SET archived = 1, updated_at = ? WHERE id = ?",
    now,
    exerciseId,
  );
  await queueCustomExerciseSnapshot(db, exerciseId, now);
}

export async function getLocalCustomExerciseBySlug(
  db: SQLiteDatabase,
  slug: string,
): Promise<LocalCustomExercise | null> {
  const row = await db.getFirstAsync<CustomExerciseRow>(
    `SELECT id, slug, remote_id, name, short, category, uses_bar, archived,
            updated_at
       FROM local_custom_exercises
      WHERE slug = ?`,
    slug,
  );
  return row ? mapCustomExercise(row) : null;
}

export async function getPendingCustomExerciseSync(
  db: SQLiteDatabase,
): Promise<PendingCustomExerciseSync | null> {
  const row = await db.getFirstAsync<{
    operation_id: string;
    entity_id: string;
    payload_json: string;
    created_at: number;
    attempt_count: number;
  }>(
    `SELECT operation_id, entity_id, payload_json, created_at, attempt_count
       FROM local_sync_outbox
      WHERE entity_type = 'custom_exercise'
      ORDER BY created_at
      LIMIT 1`,
  );
  if (!row) return null;
  return {
    operationId: row.operation_id,
    exerciseId: row.entity_id,
    snapshot: JSON.parse(row.payload_json) as CustomExerciseSyncSnapshot,
    createdAt: row.created_at,
    attemptCount: row.attempt_count,
  };
}

export async function noteCustomExerciseSyncAttempt(
  db: SQLiteDatabase,
  operationId: string,
) {
  await db.runAsync(
    `UPDATE local_sync_outbox
        SET attempt_count = attempt_count + 1
      WHERE operation_id = ?`,
    operationId,
  );
}

type SlugRemapTargets = { sessionIds: string[]; templateIds: string[] };

/**
 * Repoint every local reference from a provisional `custom:local-…` slug to the
 * durable slug Convex assigned. Returns the sessions and templates that moved so
 * the caller can refresh their queued payloads.
 */
async function remapCustomSlug(
  txn: SQLiteDatabase,
  oldSlug: string,
  newSlug: string,
): Promise<SlugRemapTargets> {
  if (oldSlug === newSlug) return { sessionIds: [], templateIds: [] };

  const sessionRows = await txn.getAllAsync<{ session_id: string }>(
    "SELECT DISTINCT session_id FROM local_session_exercises WHERE slug = ?",
    oldSlug,
  );
  const templateRows = await txn.getAllAsync<{ template_id: string }>(
    "SELECT DISTINCT template_id FROM local_template_exercises WHERE slug = ?",
    oldSlug,
  );

  await txn.runAsync(
    "UPDATE local_session_exercises SET slug = ? WHERE slug = ?",
    newSlug,
    oldSlug,
  );
  await txn.runAsync(
    "UPDATE local_template_exercises SET slug = ? WHERE slug = ?",
    newSlug,
    oldSlug,
  );
  // Notes are keyed by slug; OR REPLACE keeps the local note if the server
  // already sent one under the durable slug.
  await txn.runAsync(
    "UPDATE OR REPLACE local_exercise_notes SET slug = ? WHERE slug = ?",
    newSlug,
    oldSlug,
  );

  return {
    sessionIds: sessionRows.map((row) => row.session_id),
    templateIds: templateRows.map((row) => row.template_id),
  };
}

async function requeueRemapped(
  db: SQLiteDatabase,
  targets: SlugRemapTargets,
  now: number,
) {
  // Payloads captured before the remap still carry the provisional slug, so the
  // affected aggregates are re-snapshotted. Both pushes are upserts.
  for (const sessionId of new Set(targets.sessionIds))
    await queueSessionSnapshot(db, sessionId, now);
  for (const templateId of new Set(targets.templateIds))
    await queueTemplateSnapshot(db, templateId, now);
}

export async function completeCustomExerciseSync(
  db: SQLiteDatabase,
  operationId: string,
  exerciseId: string,
  remoteId: string,
  remoteSlug: string,
) {
  const now = Date.now();
  let targets: SlugRemapTargets = { sessionIds: [], templateIds: [] };

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ slug: string }>(
      "SELECT slug FROM local_custom_exercises WHERE id = ?",
      exerciseId,
    );
    if (existing && existing.slug !== remoteSlug) {
      // Drop any row already holding the durable slug (a bootstrap that landed
      // first) so the UNIQUE index does not reject the rename.
      await txn.runAsync(
        "DELETE FROM local_custom_exercises WHERE slug = ? AND id != ?",
        remoteSlug,
        exerciseId,
      );
      targets = await remapCustomSlug(txn, existing.slug, remoteSlug);
    }
    await txn.runAsync(
      "UPDATE local_custom_exercises SET remote_id = ?, slug = ? WHERE id = ?",
      remoteId,
      remoteSlug,
      exerciseId,
    );
    await txn.runAsync(
      "DELETE FROM local_sync_outbox WHERE operation_id = ?",
      operationId,
    );
  });

  await requeueRemapped(db, targets, now);
}

export async function applyIosBootstrap(
  db: SQLiteDatabase,
  payload: IosBootstrapPayload,
) {
  const remapTargets: SlugRemapTargets = { sessionIds: [], templateIds: [] };

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `UPDATE local_preferences
          SET unit = ?, bar_weight_lb = ?, bar_weight_kg = ?,
              active_workout_mode = ?, rest_timer_enabled = ?, updated_at = ?
        WHERE id = 1`,
      payload.preferences.unit,
      payload.preferences.barWeightLb ?? 45,
      payload.preferences.barWeightKg ?? 20,
      payload.preferences.activeWorkoutMode,
      payload.preferences.restTimerEnabled ? 1 : 0,
      payload.serverTime,
    );

    for (const template of payload.templates) {
      const existing = await txn.getFirstAsync<{ id: string }>(
        "SELECT id FROM local_templates WHERE remote_id = ?",
        template.remoteId,
      );
      const localId = existing?.id ?? template.remoteId;
      await txn.runAsync(
        `INSERT INTO local_templates (id, remote_id, name, updated_at, last_place_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(remote_id) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at,
           last_place_id = excluded.last_place_id`,
        localId,
        template.remoteId,
        template.name,
        template.updatedAt,
        template.lastPlaceId ?? null,
      );
      await txn.runAsync(
        "DELETE FROM local_template_exercises WHERE template_id = ?",
        localId,
      );
      for (const exercise of template.exercises) {
        await txn.runAsync(
          `INSERT INTO local_template_exercises (
             id, template_id, slug, order_index, sets_json
           ) VALUES (?, ?, ?, ?, ?)`,
          randomUUID(),
          localId,
          exercise.slug,
          exercise.orderIndex,
          JSON.stringify(exercise.sets),
        );
      }
    }

    for (const exercise of payload.customExercises) {
      const remoteSlug = remoteCustomSlug(exercise.remoteId);
      // `clientId` is the local row id for lifts this device authored offline,
      // so a lift that has already been uploaded is adopted rather than
      // duplicated. Otherwise fall back to matching an earlier bootstrap.
      const existing =
        (exercise.clientId
          ? await txn.getFirstAsync<{ id: string; slug: string }>(
              "SELECT id, slug FROM local_custom_exercises WHERE id = ?",
              exercise.clientId,
            )
          : null) ??
        (await txn.getFirstAsync<{ id: string; slug: string }>(
          "SELECT id, slug FROM local_custom_exercises WHERE remote_id = ?",
          exercise.remoteId,
        ));

      if (!existing) {
        await txn.runAsync(
          `INSERT INTO local_custom_exercises (
             id, slug, remote_id, name, short, category, uses_bar, archived, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             remote_id = excluded.remote_id,
             name = excluded.name,
             short = excluded.short,
             category = excluded.category,
             uses_bar = excluded.uses_bar,
             archived = excluded.archived,
             updated_at = excluded.updated_at`,
          exercise.remoteId,
          remoteSlug,
          exercise.remoteId,
          exercise.name,
          exercise.short,
          exercise.category,
          exercise.usesBar ? 1 : 0,
          exercise.archived ? 1 : 0,
          payload.serverTime,
        );
        continue;
      }

      if (existing.slug !== remoteSlug) {
        await txn.runAsync(
          "DELETE FROM local_custom_exercises WHERE slug = ? AND id != ?",
          remoteSlug,
          existing.id,
        );
        const remapped = await remapCustomSlug(txn, existing.slug, remoteSlug);
        remapTargets.sessionIds.push(...remapped.sessionIds);
        remapTargets.templateIds.push(...remapped.templateIds);
      }

      // A queued edit has not reached the server yet, so only adopt the
      // identity; the local values stay authoritative until the upload lands.
      const pending = await txn.getFirstAsync<{ entity_id: string }>(
        `SELECT entity_id FROM local_sync_outbox
          WHERE entity_type = 'custom_exercise' AND entity_id = ?`,
        existing.id,
      );
      if (pending) {
        await txn.runAsync(
          "UPDATE local_custom_exercises SET remote_id = ?, slug = ? WHERE id = ?",
          exercise.remoteId,
          remoteSlug,
          existing.id,
        );
        continue;
      }

      await txn.runAsync(
        `UPDATE local_custom_exercises
            SET remote_id = ?, slug = ?, name = ?, short = ?, category = ?,
                uses_bar = ?, archived = ?, updated_at = ?
          WHERE id = ?`,
        exercise.remoteId,
        remoteSlug,
        exercise.name,
        exercise.short,
        exercise.category,
        exercise.usesBar ? 1 : 0,
        exercise.archived ? 1 : 0,
        payload.serverTime,
        existing.id,
      );
    }

    await applyPlacesBootstrap(txn, payload);

    for (const note of payload.exerciseNotes) {
      await txn.runAsync(
        `INSERT INTO local_exercise_notes (slug, notes, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           notes = excluded.notes,
           updated_at = excluded.updated_at`,
        note.slug,
        note.notes,
        payload.serverTime,
      );
    }
    await txn.runAsync(
      `INSERT INTO local_metadata (key, value)
       VALUES ('last_bootstrap_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      String(payload.serverTime),
    );
  });

  await requeueRemapped(db, remapTargets, payload.serverTime);
}

export async function getLocalPreferences(
  db: SQLiteDatabase,
): Promise<LocalPreferences> {
  const row = await db.getFirstAsync<{
    unit: "lb" | "kg";
    bar_weight_lb: number;
    bar_weight_kg: number;
    active_workout_mode: "list" | "focus";
    rest_timer_enabled: number;
    rest_timer_notifications_enabled: number;
    apple_health_import_notifications_enabled: number;
  }>(
    `SELECT unit, bar_weight_lb, bar_weight_kg, active_workout_mode,
            rest_timer_enabled, rest_timer_notifications_enabled,
            apple_health_import_notifications_enabled
       FROM local_preferences
      WHERE id = 1`,
  );
  return {
    unit: row?.unit ?? "lb",
    barWeightLb: row?.bar_weight_lb ?? 45,
    barWeightKg: row?.bar_weight_kg ?? 20,
    activeWorkoutMode: row?.active_workout_mode ?? "list",
    restTimerEnabled: (row?.rest_timer_enabled ?? 1) === 1,
    restTimerNotificationsEnabled:
      (row?.rest_timer_notifications_enabled ?? 1) === 1,
    appleHealthImportNotificationsEnabled:
      (row?.apple_health_import_notifications_enabled ?? 0) === 1,
  };
}

export async function setLocalNotificationPreferences(
  db: SQLiteDatabase,
  preferences: LocalNotificationPreferences,
) {
  await db.runAsync(
    `UPDATE local_preferences
        SET rest_timer_notifications_enabled = ?,
            apple_health_import_notifications_enabled = ?
      WHERE id = 1`,
    preferences.restTimerNotificationsEnabled ? 1 : 0,
    preferences.appleHealthImportNotificationsEnabled ? 1 : 0,
  );
}

export async function getLastLocalSet(
  db: SQLiteDatabase,
  slug: string,
  scope?: { placeId?: string | null; machineId?: string | null },
): Promise<{ weight: number; reps: number; placeName: string | null } | null> {
  const home = await findStarredLocalPlace(db);
  const placeId = scope?.placeId ?? home?._id ?? null;
  const defaultMachine = placeId
    ? await lastLocalMachineForLift(db, placeId, slug)
    : null;
  const defaultMachineId = defaultMachine?.isDefault
    ? defaultMachine._id
    : null;

  const rows = await db.getAllAsync<{
    weight: number;
    reps: number;
    place_id: string | null;
    place_name: string | null;
    machine_id: string | null;
  }>(
    `SELECT s.weight, s.reps, w.place_id, w.place_name, e.machine_id
       FROM local_sets s
       JOIN local_session_exercises e ON e.id = s.session_exercise_id
       JOIN local_sessions w ON w.id = e.session_id
      WHERE e.slug = ? AND w.status = 'completed'
        AND s.completed = 1 AND s.reps > 0
      ORDER BY COALESCE(s.completed_at, w.completed_at, w.started_at) DESC`,
    slug,
  );
  for (const row of rows) {
    const sessionPlace = row.place_id ?? home?._id ?? null;
    if (placeId && sessionPlace && sessionPlace !== placeId) continue;
    const wanted = scope?.machineId;
    if (!wanted) {
      if (row.machine_id && row.machine_id !== defaultMachineId) continue;
    } else if (
      row.machine_id !== wanted &&
      !(row.machine_id == null && defaultMachineId === wanted)
    ) {
      continue;
    }
    return {
      weight: row.weight,
      reps: row.reps,
      placeName: row.place_name ?? home?.name ?? null,
    };
  }
  return null;
}

export async function getPendingSessionSync(
  db: SQLiteDatabase,
): Promise<PendingSessionSync | null> {
  const row = await db.getFirstAsync<{
    operation_id: string;
    entity_id: string;
    payload_json: string;
    created_at: number;
    attempt_count: number;
  }>(
    `SELECT operation_id, entity_id, payload_json, created_at, attempt_count
       FROM local_sync_outbox
      WHERE entity_type = 'session'
      ORDER BY created_at
      LIMIT 1`,
  );
  if (!row) return null;
  return {
    operationId: row.operation_id,
    sessionId: row.entity_id,
    snapshot: JSON.parse(row.payload_json) as SessionSyncSnapshot,
    createdAt: row.created_at,
    attemptCount: row.attempt_count,
  };
}

export async function noteSessionSyncAttempt(
  db: SQLiteDatabase,
  operationId: string,
) {
  await db.runAsync(
    `UPDATE local_sync_outbox
        SET attempt_count = attempt_count + 1
      WHERE operation_id = ?`,
    operationId,
  );
}

export async function completeSessionSync(
  db: SQLiteDatabase,
  operationId: string,
  sessionId: string,
  remoteSessionId: string | null,
) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (remoteSessionId) {
      await txn.runAsync(
        "UPDATE local_sessions SET remote_id = ? WHERE id = ?",
        remoteSessionId,
        sessionId,
      );
    }
    await txn.runAsync(
      "DELETE FROM local_sync_outbox WHERE operation_id = ?",
      operationId,
    );
  });
}

export async function getPendingSessionDelete(
  db: SQLiteDatabase,
): Promise<PendingSessionDelete | null> {
  const row = await db.getFirstAsync<{
    operation_id: string;
    entity_id: string;
    payload_json: string;
    created_at: number;
    attempt_count: number;
  }>(
    `SELECT operation_id, entity_id, payload_json, created_at, attempt_count
       FROM local_sync_outbox
      WHERE entity_type = 'session_delete'
      ORDER BY created_at
      LIMIT 1`,
  );
  if (!row) return null;
  return {
    operationId: row.operation_id,
    sessionId: row.entity_id,
    snapshot: JSON.parse(row.payload_json) as SessionDeleteSnapshot,
    createdAt: row.created_at,
    attemptCount: row.attempt_count,
  };
}

export async function completeSessionDeleteSync(
  db: SQLiteDatabase,
  operationId: string,
) {
  await db.runAsync(
    "DELETE FROM local_sync_outbox WHERE operation_id = ?",
    operationId,
  );
}

const HEALTH_AUTH_REQUESTED_KEY = "health_auth_requested";

export async function getHealthAuthRequested(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_metadata WHERE key = ?",
    HEALTH_AUTH_REQUESTED_KEY,
  );
  return row?.value === "1";
}

export async function setHealthAuthRequested(
  db: SQLiteDatabase,
  requested = true,
) {
  await db.runAsync(
    `INSERT INTO local_metadata (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    HEALTH_AUTH_REQUESTED_KEY,
    requested ? "1" : "0",
  );
}

const HEALTH_EXPORT_ENABLED_KEY = "export_enabled";

export async function getHealthExportEnabled(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_health_state WHERE key = ?",
    HEALTH_EXPORT_ENABLED_KEY,
  );
  return row?.value === "1";
}

export async function setHealthExportEnabled(
  db: SQLiteDatabase,
  enabled: boolean,
) {
  await db.runAsync(
    `INSERT INTO local_health_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    HEALTH_EXPORT_ENABLED_KEY,
    enabled ? "1" : "0",
  );
}

const HEALTH_AUTO_IMPORT_ENABLED_KEY = "auto_import_enabled";
const HEALTH_AUTO_IMPORT_ALL_KEY = "auto_import_all";
const HEALTH_AUTO_IMPORT_TYPES_KEY = "auto_import_types";
const HEALTH_AUTO_IMPORT_ANCHOR_KEY = "auto_import_anchor";

async function healthStateValue(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_health_state WHERE key = ?",
    key,
  );
  return row?.value ?? null;
}

async function setHealthStateValue(
  db: SQLiteDatabase,
  key: string,
  value: string,
) {
  await db.runAsync(
    `INSERT INTO local_health_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function getHealthAutoImportPrefs(
  db: SQLiteDatabase,
): Promise<HealthAutoImportPrefs> {
  const [enabled, importAll, types] = await Promise.all([
    healthStateValue(db, HEALTH_AUTO_IMPORT_ENABLED_KEY),
    healthStateValue(db, HEALTH_AUTO_IMPORT_ALL_KEY),
    healthStateValue(db, HEALTH_AUTO_IMPORT_TYPES_KEY),
  ]);
  return parseHealthAutoImportPrefs({ enabled, importAll, types });
}

export async function setHealthAutoImportPrefs(
  db: SQLiteDatabase,
  prefs: HealthAutoImportPrefs,
) {
  await setHealthStateValue(
    db,
    HEALTH_AUTO_IMPORT_ENABLED_KEY,
    prefs.enabled ? "1" : "0",
  );
  await setHealthStateValue(
    db,
    HEALTH_AUTO_IMPORT_ALL_KEY,
    prefs.importAllTypes ? "1" : "0",
  );
  await setHealthStateValue(
    db,
    HEALTH_AUTO_IMPORT_TYPES_KEY,
    JSON.stringify(prefs.types),
  );
}

export async function getHealthAutoImportAnchor(db: SQLiteDatabase) {
  return healthStateValue(db, HEALTH_AUTO_IMPORT_ANCHOR_KEY);
}

export async function setHealthAutoImportAnchor(
  db: SQLiteDatabase,
  anchor: string,
) {
  await setHealthStateValue(db, HEALTH_AUTO_IMPORT_ANCHOR_KEY, anchor);
}

export async function markWatchRecorded(db: SQLiteDatabase, sessionId: string) {
  await setHealthStateValue(db, watchRecordedKey(sessionId), "1");
}

export async function wasWatchRecorded(db: SQLiteDatabase, sessionId: string) {
  return (await healthStateValue(db, watchRecordedKey(sessionId))) === "1";
}

export async function saveWatchHealthUuid(
  db: SQLiteDatabase,
  sessionId: string,
  healthUuid: string,
) {
  await setHealthStateValue(db, watchHealthUuidKey(sessionId), healthUuid);
}

export async function consumeWatchHealthUuid(
  db: SQLiteDatabase,
  sessionId: string,
) {
  const key = watchHealthUuidKey(sessionId);
  const uuid = await healthStateValue(db, key);
  if (!uuid) return null;
  await db.runAsync("DELETE FROM local_health_state WHERE key = ?", key);
  return uuid;
}

export async function queueHealthExportIfEnabled(
  db: SQLiteDatabase,
  sessionId: string,
) {
  const [enabled, session] = await Promise.all([
    getHealthExportEnabled(db),
    db.getFirstAsync<{
      status: string;
      session_kind: string | null;
      external_id: string | null;
    }>(
      `SELECT status, session_kind, external_id
         FROM local_sessions
        WHERE id = ?`,
      sessionId,
    ),
  ]);
  if (!session) return;
  if (
    !shouldQueueHealthExport({
      exportEnabled: enabled,
      status: session.status,
      sessionKind: session.session_kind,
      externalId: session.external_id,
    })
  ) {
    return;
  }
  await db.runAsync(
    `UPDATE local_sessions SET health_export_pending = 1 WHERE id = ?`,
    sessionId,
  );
}

export type PendingHealthExport = {
  sessionId: string;
  startedAt: number;
  endedAt: number;
};

export async function listPendingHealthExports(
  db: SQLiteDatabase,
): Promise<PendingHealthExport[]> {
  const rows = await db.getAllAsync<{
    id: string;
    started_at: number;
    completed_at: number | null;
  }>(
    `SELECT id, started_at, completed_at
       FROM local_sessions
      WHERE health_export_pending = 1
        AND status = 'completed'
        AND session_kind = 'tracked'
        AND external_id IS NULL
      ORDER BY COALESCE(completed_at, started_at) ASC`,
  );
  return rows.map((row) => ({
    sessionId: row.id,
    startedAt: row.started_at,
    endedAt: healthExportEndMs(row.started_at, row.completed_at),
  }));
}

export async function countPendingHealthExports(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM local_sessions
      WHERE health_export_pending = 1
        AND status = 'completed'
        AND session_kind = 'tracked'
        AND external_id IS NULL`,
  );
  return row?.count ?? 0;
}

export async function attachExportedHealthUuid(
  db: SQLiteDatabase,
  sessionId: string,
  healthUuid: string,
) {
  const existing = await findLocalSessionByExternalId(
    db,
    "apple_health",
    healthUuid,
  );
  if (existing && existing.id !== sessionId) {
    throw new Error("This Apple Health workout is already linked");
  }
  const session = await db.getFirstAsync<{
    status: string;
    session_kind: string | null;
    started_at: number;
    completed_at: number | null;
  }>(
    `SELECT status, session_kind, started_at, completed_at
       FROM local_sessions
      WHERE id = ?`,
    sessionId,
  );
  if (!session) throw new Error("Session not found");
  if (session.status !== "completed" || session.session_kind !== "tracked") {
    throw new Error("Can only save Health export on a completed workout");
  }
  const now = Date.now();
  const durationSeconds =
    session.completed_at != null
      ? Math.max(0, (session.completed_at - session.started_at) / 1000)
      : null;
  await db.runAsync(
    `UPDATE local_sessions
        SET external_provider = 'apple_health',
            external_id = ?,
            activity_type = COALESCE(activity_type, ?),
            source_name = COALESCE(source_name, ?),
            source_bundle_id = COALESCE(source_bundle_id, ?),
            duration_seconds = COALESCE(duration_seconds, ?),
            imported_at = COALESCE(imported_at, ?),
            health_export_pending = 0,
            updated_at = ?
      WHERE id = ?`,
    healthUuid,
    HEALTH_EXPORT_ACTIVITY_TYPE,
    HEALTH_EXPORT_SOURCE_NAME,
    APP_BUNDLE_ID,
    durationSeconds,
    now,
    now,
    sessionId,
  );
  await queueSessionSnapshot(db, sessionId, now);
}

export async function findLocalSessionByExternalId(
  db: SQLiteDatabase,
  provider: string,
  externalId: string,
) {
  return db.getFirstAsync<{ id: string; session_kind: string | null }>(
    `SELECT id, session_kind
       FROM local_sessions
      WHERE external_provider = ? AND external_id = ?`,
    provider,
    externalId,
  );
}

export async function listImportedHealthIds(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{
    id: string;
    external_id: string;
    session_kind: string | null;
  }>(
    `SELECT id, external_id, session_kind
       FROM local_sessions
      WHERE external_provider = 'apple_health' AND external_id IS NOT NULL`,
  );
  return new Map(
    rows.map((row) => [
      row.external_id,
      { sessionId: row.id, sessionKind: mapSessionKind(row.session_kind) },
    ]),
  );
}

export async function listIgnoredHealthIds(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ external_id: string }>(
    "SELECT external_id FROM local_health_ignored",
  );
  return new Set(rows.map((row) => row.external_id));
}

export async function ignoreHealthWorkout(
  db: SQLiteDatabase,
  externalId: string,
) {
  await db.runAsync(
    `INSERT INTO local_health_ignored (external_id, ignored_at)
     VALUES (?, ?)
     ON CONFLICT(external_id) DO UPDATE SET ignored_at = excluded.ignored_at`,
    externalId,
    Date.now(),
  );
}

export type LocalOverlapSession = {
  sessionId: string;
  templateName: string;
  startedAt: number;
  completedAt: number;
};

export async function listLocalOverlapCandidates(
  db: SQLiteDatabase,
): Promise<LocalOverlapSession[]> {
  const rows = await db.getAllAsync<{
    id: string;
    template_name: string;
    started_at: number;
    completed_at: number | null;
  }>(
    `SELECT id, template_name, started_at, completed_at
       FROM local_sessions
      WHERE status = 'completed' AND session_kind = 'tracked'`,
  );
  return rows.map((row) => ({
    sessionId: row.id,
    templateName: row.template_name,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? row.started_at,
  }));
}

export type HealthSummaryImport = {
  uuid: string;
  activityType: string;
  activityName: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  energyKcal: number | null;
  distanceMeters: number | null;
  sourceName: string | null;
  sourceBundleId: string | null;
};

export async function importHealthSummarySession(
  db: SQLiteDatabase,
  workout: HealthSummaryImport,
): Promise<{ sessionId: string; alreadyImported: boolean }> {
  const existing = await findLocalSessionByExternalId(
    db,
    "apple_health",
    workout.uuid,
  );
  if (existing) return { sessionId: existing.id, alreadyImported: true };

  const now = Date.now();
  const sessionId = randomUUID();
  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        `INSERT INTO local_sessions (
           id, template_name, status, session_kind, started_at, completed_at,
           updated_at, counts_toward_goals, external_provider, external_id,
           activity_type, source_name, source_bundle_id, duration_seconds,
           energy_kcal, distance_meters, imported_at
         ) VALUES (
           ?, ?, 'completed', 'health_summary', ?, ?, ?, 1, 'apple_health', ?,
           ?, ?, ?, ?, ?, ?, ?
         )`,
        sessionId,
        workout.activityName,
        workout.startedAt,
        workout.endedAt,
        now,
        workout.uuid,
        workout.activityType,
        workout.sourceName,
        workout.sourceBundleId,
        workout.durationSeconds,
        workout.energyKcal,
        workout.distanceMeters,
        now,
      );
      await queueSessionSnapshot(txn, sessionId, now);
    });
  } catch (caught) {
    const duplicate = await findLocalSessionByExternalId(
      db,
      "apple_health",
      workout.uuid,
    );
    if (duplicate) return { sessionId: duplicate.id, alreadyImported: true };
    throw caught;
  }
  return { sessionId, alreadyImported: false };
}

export async function linkHealthSummaryToSession(
  db: SQLiteDatabase,
  sessionId: string,
  workout: HealthSummaryImport,
) {
  const existing = await findLocalSessionByExternalId(
    db,
    "apple_health",
    workout.uuid,
  );
  if (existing && existing.id !== sessionId) {
    throw new Error("This Apple Health workout is already linked");
  }
  const session = await db.getFirstAsync<{
    status: string;
    session_kind: string | null;
  }>("SELECT status, session_kind FROM local_sessions WHERE id = ?", sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "completed") {
    throw new Error("Can only link Health to a completed workout");
  }
  const now = Date.now();
  await db.runAsync(
    `UPDATE local_sessions
        SET external_provider = 'apple_health',
            external_id = ?,
            activity_type = ?,
            source_name = ?,
            source_bundle_id = ?,
            duration_seconds = COALESCE(duration_seconds, ?),
            energy_kcal = COALESCE(energy_kcal, ?),
            distance_meters = COALESCE(distance_meters, ?),
            imported_at = COALESCE(imported_at, ?),
            updated_at = ?
      WHERE id = ?`,
    workout.uuid,
    workout.activityType,
    workout.sourceName,
    workout.sourceBundleId,
    workout.durationSeconds,
    workout.energyKcal,
    workout.distanceMeters,
    now,
    now,
    sessionId,
  );
  await queueSessionSnapshot(db, sessionId, now);
}

export async function getOrCreateDeviceId(db: SQLiteDatabase) {
  const existing = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_metadata WHERE key = 'device_id'",
  );
  if (existing) return existing.value;
  const value = randomUUID();
  await db.runAsync(
    "INSERT INTO local_metadata (key, value) VALUES ('device_id', ?)",
    value,
  );
  return value;
}
