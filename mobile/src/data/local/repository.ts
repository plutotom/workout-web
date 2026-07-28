import { randomUUID } from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

import type {
  CustomExerciseSyncSnapshot,
  IosBootstrapPayload,
  LocalActiveWorkout,
  LocalCustomExercise,
  LocalMuscleGroup,
  LocalPreferences,
  LocalTemplate,
  LocalWorkoutExercise,
  LocalWorkoutSession,
  LocalWorkoutSet,
  PendingCustomExerciseSync,
  PendingSessionSync,
  SessionSyncSnapshot,
} from "@/data/local/types";
import {
  isUnsyncedTemplateRemoteId,
  localCustomSlug,
  localTemplateRemoteId,
  remoteCustomSlug,
} from "@/data/local/types";

const DEFAULT_REST_SECONDS = 75;
const DEFAULT_SET_ROWS = 3;
const MAX_EXERCISES = 50;
const MAX_SETS = 20;
const MAX_WEIGHT = 10_000;
const MAX_REPS = 1_000;
const MAX_CUSTOM_EXERCISES = 200;
const MAX_CUSTOM_NAME_LENGTH = 80;
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
  started_at: number;
  completed_at: number | null;
  updated_at: number;
};

type ExerciseRow = {
  id: string;
  session_id: string;
  slug: string;
  order_index: number;
  rest_seconds: number;
  notes: string | null;
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
    sets: sets.map(mapSet),
  };
}

export async function getLocalWorkout(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<LocalWorkoutSession | null> {
  const session = await db.getFirstAsync<SessionRow>(
    `SELECT id, remote_id, template_id, remote_template_id, template_name,
            status, started_at, completed_at, updated_at
       FROM local_sessions
      WHERE id = ?`,
    sessionId,
  );
  if (!session) return null;
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT e.id, e.session_id, e.slug, e.order_index, e.rest_seconds,
            COALESCE(e.notes, n.notes) AS notes
       FROM local_session_exercises e
       LEFT JOIN local_exercise_notes n ON n.slug = e.slug
      WHERE e.session_id = ?
      ORDER BY e.order_index`,
    sessionId,
  );
  const exercises = await Promise.all(rows.map((row) => loadExercise(db, row)));
  return {
    _id: session.id,
    remoteId: session.remote_id,
    remoteTemplateId: session.remote_template_id,
    status: session.status,
    templateId: session.template_id,
    templateName: session.template_name,
    startedAt: session.started_at,
    completedAt: session.completed_at ?? undefined,
    updatedAt: session.updated_at,
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
  const sessions = await db.getAllAsync<{
    id: string;
    remote_id: string | null;
    template_id: string | null;
    remote_template_id: string | null;
    template_name: string;
    started_at: number;
    completed_at: number | null;
  }>(
    `SELECT id, remote_id, template_id, remote_template_id, template_name,
            started_at, completed_at
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
        exercises: withSets,
      } satisfies LocalInsightsSession;
    }),
  );

  return loaded.filter((session) =>
    session.exercises.some((exercise) =>
      exercise.sets.some((set) => set.completed && set.reps > 0),
    ),
  );
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

function snapshotFromSession(
  session: LocalWorkoutSession,
): SessionSyncSnapshot {
  return {
    clientId: session._id,
    remoteTemplateId: session.remoteTemplateId,
    templateName: session.templateName,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? null,
    updatedAt: session.updatedAt,
    exercises: session.exercises.map((exercise) => ({
      clientId: exercise._id,
      slug: exercise.slug,
      orderIndex: exercise.orderIndex,
      restSeconds: exercise.restSeconds,
      notes: exercise.notes ?? null,
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
    })),
  };
}

async function queueSessionSnapshot(
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
    JSON.stringify(snapshotFromSession(session)),
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
) {
  const now = Date.now();
  await abandonExistingIfAllowed(db, abandonExisting, now);
  const sessionId = randomUUID();
  await db.runAsync(
    `INSERT INTO local_sessions (
       id, template_name, status, started_at, updated_at
     ) VALUES (?, 'Quick start', 'in_progress', ?, ?)`,
    sessionId,
    now,
    now,
  );
  await queueSessionSnapshot(db, sessionId, now);
  return sessionId;
}

export async function startLocalTemplateWorkout(
  db: SQLiteDatabase,
  templateId: string,
  abandonExisting = false,
) {
  const template = await getLocalTemplate(db, templateId);
  if (!template) throw new Error("Template is not available offline yet");
  const now = Date.now();
  await abandonExistingIfAllowed(db, abandonExisting, now);
  const sessionId = randomUUID();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO local_sessions (
         id, template_id, remote_template_id, template_name, status,
         started_at, updated_at
       ) VALUES (?, ?, ?, ?, 'in_progress', ?, ?)`,
      sessionId,
      template._id,
      template.remoteId,
      template.name,
      now,
      now,
    );
    for (const exercise of template.exercises) {
      const exerciseId = randomUUID();
      await txn.runAsync(
        `INSERT INTO local_session_exercises (
           id, session_id, slug, order_index, rest_seconds
         ) VALUES (?, ?, ?, ?, ?)`,
        exerciseId,
        sessionId,
        exercise.slug,
        exercise.orderIndex,
        DEFAULT_REST_SECONDS,
      );
      for (let index = 0; index < exercise.sets.length; index++) {
        const set = exercise.sets[index];
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

  const previous = await db.getFirstAsync<{
    weight: number;
    reps: number;
  }>(
    `SELECT s.weight, s.reps
       FROM local_sets s
       JOIN local_session_exercises e ON e.id = s.session_exercise_id
       JOIN local_sessions w ON w.id = e.session_id
      WHERE e.slug = ? AND w.status = 'completed'
        AND s.completed = 1 AND s.reps > 0
      ORDER BY COALESCE(s.completed_at, w.completed_at, w.started_at) DESC
      LIMIT 1`,
    slug,
  );
  const seed = previous ?? { weight: 0, reps: 0 };
  const exerciseId = randomUUID();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO local_session_exercises (
         id, session_id, slug, order_index, rest_seconds
       ) VALUES (?, ?, ?, ?, ?)`,
      exerciseId,
      sessionId,
      slug,
      exercises.length,
      DEFAULT_REST_SECONDS,
    );
    for (let index = 0; index < DEFAULT_SET_ROWS; index++) {
      await txn.runAsync(
        `INSERT INTO local_sets (
           id, session_exercise_id, order_index, target_weight, target_reps,
           weight, reps, completed
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        randomUUID(),
        exerciseId,
        index,
        seed.weight,
        seed.reps,
        seed.weight,
        seed.reps,
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
  const row = await db.getFirstAsync<{ status: string }>(
    "SELECT status FROM local_sessions WHERE id = ?",
    sessionId,
  );
  if (!row) return;
  if (row.status === "in_progress")
    throw new Error("Cannot delete an active workout");
  await db.runAsync("DELETE FROM local_sessions WHERE id = ?", sessionId);
  await db.runAsync(
    `DELETE FROM local_sync_outbox
      WHERE entity_type = 'session' AND entity_id = ?`,
    sessionId,
  );
}

export async function getLocalTemplate(
  db: SQLiteDatabase,
  templateId: string,
): Promise<LocalTemplate | null> {
  const template = await db.getFirstAsync<TemplateRow>(
    `SELECT id, remote_id, name, updated_at
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

async function queueTemplateSnapshot(
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
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (remoteTemplateId) {
      await txn.runAsync(
        "UPDATE local_templates SET remote_id = ? WHERE id = ?",
        remoteTemplateId,
        templateId,
      );
    }
    await txn.runAsync(
      "DELETE FROM local_sync_outbox WHERE operation_id = ?",
      operationId,
    );
  });
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

async function queueCustomExerciseSnapshot(
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
        `INSERT INTO local_templates (id, remote_id, name, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(remote_id) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at`,
        localId,
        template.remoteId,
        template.name,
        template.updatedAt,
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
  }>(
    `SELECT unit, bar_weight_lb, bar_weight_kg, active_workout_mode,
            rest_timer_enabled
       FROM local_preferences
      WHERE id = 1`,
  );
  return {
    unit: row?.unit ?? "lb",
    barWeightLb: row?.bar_weight_lb ?? 45,
    barWeightKg: row?.bar_weight_kg ?? 20,
    activeWorkoutMode: row?.active_workout_mode ?? "list",
    restTimerEnabled: (row?.rest_timer_enabled ?? 1) === 1,
  };
}

export async function getLastLocalSet(
  db: SQLiteDatabase,
  slug: string,
): Promise<{ weight: number; reps: number } | null> {
  return await db.getFirstAsync<{ weight: number; reps: number }>(
    `SELECT s.weight, s.reps
       FROM local_sets s
       JOIN local_session_exercises e ON e.id = s.session_exercise_id
       JOIN local_sessions w ON w.id = e.session_id
      WHERE e.slug = ? AND w.status = 'completed'
        AND s.completed = 1 AND s.reps > 0
      ORDER BY COALESCE(s.completed_at, w.completed_at, w.started_at) DESC
      LIMIT 1`,
    slug,
  );
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
