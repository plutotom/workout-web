import type { SQLiteDatabase } from "expo-sqlite";

import {
  getLocalPreferences,
  queueCustomExerciseSnapshot,
  queueSessionSnapshot,
  queueTemplateSnapshot,
} from "@/data/local/repository";
import type {
  LocalMuscleGroup,
  LocalPreferences,
  LocalSessionKind,
  LocalSessionStatus,
  LocalTemplateSet,
} from "@/data/local/types";
import { localTemplateRemoteId } from "@/data/local/types";

/**
 * A full snapshot of the phone's local database — the thing the portable
 * bundle deliberately isn't.
 *
 * `@shared/workout-export` carries templates, custom lifts and notes because
 * it exists to hand a workout to somebody else. A backup has to carry the part
 * that can't be re-derived or re-shared: every session, exercise and set the
 * user has ever logged. So this is a second, mobile-only format.
 *
 * Two properties matter more than compactness:
 *
 * - **Restore is idempotent.** Every row travels with its primary key, and
 *   restore inserts only ids the phone doesn't already have. Restoring the
 *   same file twice, or onto a phone that already has some of the data,
 *   changes nothing the second time. That's what makes a restore button safe
 *   to press when you're not sure whether you need it.
 * - **No server identity travels.** `remote_id` columns are omitted, not
 *   nulled-out-on-read: a backup may be restored into a different account, and
 *   local rows pointing at another account's documents would be worse than
 *   useless. Row ids double as sync client ids (see
 *   `queueCustomExerciseSnapshot`), so restored rows still upload without
 *   duplicating anything the account already has.
 */

export const BACKUP_FORMAT = "workout.backup";
export const BACKUP_VERSION = 1;

export type BackupCustomExercise = {
  id: string;
  slug: string;
  name: string;
  short: string | null;
  category: LocalMuscleGroup;
  usesBar: boolean;
  archived: boolean;
  updatedAt: number;
};

export type BackupTemplate = {
  id: string;
  name: string;
  updatedAt: number;
  exercises: Array<{
    id: string;
    slug: string;
    orderIndex: number;
    sets: LocalTemplateSet[];
  }>;
};

export type BackupExerciseNote = {
  slug: string;
  notes: string;
  updatedAt: number;
};

export type BackupSet = {
  id: string;
  orderIndex: number;
  targetWeight: number;
  targetReps: number;
  weight: number;
  reps: number;
  completed: boolean;
  completedAt: number | null;
};

export type BackupSessionExercise = {
  id: string;
  slug: string;
  orderIndex: number;
  restSeconds: number;
  notes: string | null;
  sets: BackupSet[];
};

export type BackupSession = {
  id: string;
  templateId: string | null;
  templateName: string;
  status: LocalSessionStatus;
  sessionKind?: LocalSessionKind;
  startedAt: number;
  completedAt: number | null;
  updatedAt: number;
  countsTowardGoals?: boolean;
  externalProvider?: "apple_health" | null;
  externalId?: string | null;
  activityType?: string | null;
  sourceName?: string | null;
  sourceBundleId?: string | null;
  durationSeconds?: number | null;
  energyKcal?: number | null;
  distanceMeters?: number | null;
  importedAt?: number | null;
  exercises: BackupSessionExercise[];
};

export type WorkoutBackupSnapshot = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: number;
  preferences: LocalPreferences;
  customExercises: BackupCustomExercise[];
  templates: BackupTemplate[];
  exerciseNotes: BackupExerciseNote[];
  sessions: BackupSession[];
};

// Ceilings for untrusted input. A real backup is nowhere near these; they
// exist so a malformed or hostile file fails fast instead of locking the UI
// while SQLite chews through it.
const MAX_INPUT_LENGTH = 32_000_000;
const MAX_SESSIONS = 20_000;
const MAX_TEMPLATES = 1_000;
const MAX_CUSTOM_EXERCISES = 1_000;
const MAX_NOTES = 5_000;
const MAX_EXERCISES_PER_SESSION = 200;
const MAX_SETS_PER_EXERCISE = 200;

const MUSCLE_GROUPS: readonly LocalMuscleGroup[] = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "core",
];

const SESSION_STATUSES: readonly LocalSessionStatus[] = [
  "in_progress",
  "completed",
  "abandoned",
];

type TemplateRow = { id: string; name: string; updated_at: number };
type TemplateExerciseRow = {
  id: string;
  template_id: string;
  slug: string;
  order_index: number;
  sets_json: string;
};
type CustomExerciseRow = {
  id: string;
  slug: string;
  name: string;
  short: string | null;
  category: string;
  uses_bar: number;
  archived: number;
  updated_at: number;
};
type NoteRow = { slug: string; notes: string; updated_at: number };
type SessionRow = {
  id: string;
  template_id: string | null;
  template_name: string;
  status: LocalSessionStatus;
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
};
type SessionExerciseRow = {
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

/** Template presets are stored as JSON; a corrupt blob shouldn't sink a backup. */
function parseTemplateSets(json: string): LocalTemplateSet[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) =>
      isRecord(entry) &&
      typeof entry.weight === "number" &&
      typeof entry.reps === "number"
        ? [{ weight: entry.weight, reps: entry.reps }]
        : [],
    );
  } catch {
    return [];
  }
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const existing = grouped.get(key(row));
    if (existing) existing.push(row);
    else grouped.set(key(row), [row]);
  }
  return grouped;
}

/**
 * Read the whole local database into a snapshot.
 *
 * `local_sync_outbox` and `local_metadata` are left out on purpose: the outbox
 * is in-flight sync state that would replay uploads on another device, and the
 * metadata table holds this install's device id, which must stay unique.
 */
export async function createLocalBackup(
  db: SQLiteDatabase,
): Promise<WorkoutBackupSnapshot> {
  const preferences = await getLocalPreferences(db);

  const customRows = await db.getAllAsync<CustomExerciseRow>(
    `SELECT id, slug, name, short, category, uses_bar, archived, updated_at
       FROM local_custom_exercises
      ORDER BY name`,
  );
  const noteRows = await db.getAllAsync<NoteRow>(
    "SELECT slug, notes, updated_at FROM local_exercise_notes ORDER BY slug",
  );
  const templateRows = await db.getAllAsync<TemplateRow>(
    "SELECT id, name, updated_at FROM local_templates ORDER BY name",
  );
  const templateExerciseRows = await db.getAllAsync<TemplateExerciseRow>(
    `SELECT id, template_id, slug, order_index, sets_json
       FROM local_template_exercises
      ORDER BY template_id, order_index`,
  );
  const sessionRows = await db.getAllAsync<SessionRow>(
    `SELECT id, template_id, template_name, status, session_kind, started_at,
            completed_at, updated_at, counts_toward_goals, external_provider,
            external_id, activity_type, source_name, source_bundle_id,
            duration_seconds, energy_kcal, distance_meters, imported_at
       FROM local_sessions
      ORDER BY started_at`,
  );
  const sessionExerciseRows = await db.getAllAsync<SessionExerciseRow>(
    `SELECT id, session_id, slug, order_index, rest_seconds, notes
       FROM local_session_exercises
      ORDER BY session_id, order_index`,
  );
  const setRows = await db.getAllAsync<SetRow>(
    `SELECT id, session_exercise_id, order_index, target_weight, target_reps,
            weight, reps, completed, completed_at
       FROM local_sets
      ORDER BY session_exercise_id, order_index`,
  );

  const exercisesByTemplate = groupBy(templateExerciseRows, (row) =>
    String(row.template_id),
  );
  const exercisesBySession = groupBy(sessionExerciseRows, (row) =>
    String(row.session_id),
  );
  const setsByExercise = groupBy(setRows, (row) =>
    String(row.session_exercise_id),
  );

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    preferences,
    customExercises: customRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      short: row.short,
      category: (MUSCLE_GROUPS.includes(row.category as LocalMuscleGroup)
        ? row.category
        : "chest") as LocalMuscleGroup,
      usesBar: row.uses_bar === 1,
      archived: row.archived === 1,
      updatedAt: row.updated_at,
    })),
    templates: templateRows.map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
      exercises: (exercisesByTemplate.get(row.id) ?? []).map((exercise) => ({
        id: exercise.id,
        slug: exercise.slug,
        orderIndex: exercise.order_index,
        sets: parseTemplateSets(exercise.sets_json),
      })),
    })),
    exerciseNotes: noteRows.map((row) => ({
      slug: row.slug,
      notes: row.notes,
      updatedAt: row.updated_at,
    })),
    sessions: sessionRows.map((row) => ({
      id: row.id,
      templateId: row.template_id,
      templateName: row.template_name,
      status: row.status,
      sessionKind:
        row.session_kind === "health_summary" ? "health_summary" : "tracked",
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
      countsTowardGoals: row.counts_toward_goals !== 0,
      externalProvider:
        row.external_provider === "apple_health" ? "apple_health" : null,
      externalId: row.external_id,
      activityType: row.activity_type,
      sourceName: row.source_name,
      sourceBundleId: row.source_bundle_id,
      durationSeconds: row.duration_seconds,
      energyKcal: row.energy_kcal,
      distanceMeters: row.distance_meters,
      importedAt: row.imported_at,
      exercises: (exercisesBySession.get(row.id) ?? []).map((exercise) => ({
        id: exercise.id,
        slug: exercise.slug,
        orderIndex: exercise.order_index,
        restSeconds: exercise.rest_seconds,
        notes: exercise.notes,
        sets: (setsByExercise.get(exercise.id) ?? []).map((set) => ({
          id: set.id,
          orderIndex: set.order_index,
          targetWeight: set.target_weight,
          targetReps: set.target_reps,
          weight: set.weight,
          reps: set.reps,
          completed: set.completed === 1,
          completedAt: set.completed_at,
        })),
      })),
    })),
  };
}

/**
 * Compact, unlike `serializeBundle`. A share bundle is a handful of templates
 * somebody might open in a text editor; a backup is years of sets, and the
 * indentation would be most of the file.
 */
export function serializeBackup(snapshot: WorkoutBackupSnapshot): string {
  return JSON.stringify(snapshot);
}

export function backupFileName(snapshot: WorkoutBackupSnapshot): string {
  const date = new Date(snapshot.createdAt).toISOString().slice(0, 10);
  return `workout-backup-${date}.json`;
}

const LAST_BACKUP_KEY = "last_backup_at";

/**
 * How old a backup gets before the settings card stops being reassuring and
 * starts drawing attention. A manual backup nobody repeats is the real failure
 * mode here — a file from last winter is barely better than no file.
 */
export const BACKUP_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Per-install, so it deliberately lives in the tables a snapshot skips. */
export async function getLastBackupAt(
  db: SQLiteDatabase,
): Promise<number | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_metadata WHERE key = ?",
    LAST_BACKUP_KEY,
  );
  const parsed = row ? Number(row.value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Recorded when the share sheet closes, which is as much as iOS will tell us:
 * `UIActivityViewController` reports dismissal, not whether a destination was
 * picked, and expo-sharing's `completionWithItemsHandler` resolves
 * unconditionally. So this can run one cancelled sheet ahead of the truth. That
 * imprecision is worth accepting — the case this exists to catch is a backup
 * that's months old, and being a few minutes optimistic doesn't hide that.
 */
export async function markBackupSaved(
  db: SQLiteDatabase,
  at = Date.now(),
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_metadata (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    LAST_BACKUP_KEY,
    String(at),
  );
}

export type BackupParseResult =
  | { ok: true; snapshot: WorkoutBackupSnapshot }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseBackup(input: string): BackupParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: "That file is empty" };
  if (text.length > MAX_INPUT_LENGTH)
    return { ok: false, error: "That backup is too large to restore" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "That doesn't look like a backup file — expected a .json backup",
    };
  }
  return validateBackup(parsed);
}

/**
 * Structural check on an untrusted file. Restore runs raw SQL against these
 * values, so everything that reaches the database is proved here first.
 */
export function validateBackup(value: unknown): BackupParseResult {
  if (!isRecord(value)) return { ok: false, error: "Backup is not an object" };
  if (value.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error:
        value.format === "workout.export"
          ? "That's a shared workout file, not a backup — use Import templates instead"
          : "That file isn't a workout backup",
    };
  }
  if (value.version !== BACKUP_VERSION) {
    return {
      ok: false,
      error:
        isFiniteNumber(value.version) && value.version > BACKUP_VERSION
          ? "This backup was made by a newer version of the app — update and try again"
          : "This backup uses an unsupported format version",
    };
  }

  const preferences = validatePreferences(value.preferences);

  const customExercises: BackupCustomExercise[] = [];
  const rawCustoms = Array.isArray(value.customExercises)
    ? value.customExercises
    : [];
  if (rawCustoms.length > MAX_CUSTOM_EXERCISES)
    return { ok: false, error: "That backup has too many custom exercises" };
  for (const raw of rawCustoms) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || typeof raw.slug !== "string") continue;
    if (typeof raw.name !== "string") continue;
    customExercises.push({
      id: raw.id,
      slug: raw.slug,
      name: raw.name,
      short: optionalString(raw.short),
      category: MUSCLE_GROUPS.includes(raw.category as LocalMuscleGroup)
        ? (raw.category as LocalMuscleGroup)
        : "chest",
      usesBar: raw.usesBar === true,
      archived: raw.archived === true,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
    });
  }

  const templates: BackupTemplate[] = [];
  const rawTemplates = Array.isArray(value.templates) ? value.templates : [];
  if (rawTemplates.length > MAX_TEMPLATES)
    return { ok: false, error: "That backup has too many templates" };
  for (const raw of rawTemplates) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    const rawExercises = Array.isArray(raw.exercises) ? raw.exercises : [];
    const exercises: BackupTemplate["exercises"] = [];
    for (const rawExercise of rawExercises.slice(
      0,
      MAX_EXERCISES_PER_SESSION,
    )) {
      if (!isRecord(rawExercise)) continue;
      if (
        typeof rawExercise.id !== "string" ||
        typeof rawExercise.slug !== "string"
      )
        continue;
      const rawSets = Array.isArray(rawExercise.sets) ? rawExercise.sets : [];
      exercises.push({
        id: rawExercise.id,
        slug: rawExercise.slug,
        orderIndex: isFiniteNumber(rawExercise.orderIndex)
          ? rawExercise.orderIndex
          : exercises.length,
        sets: rawSets
          .slice(0, MAX_SETS_PER_EXERCISE)
          .flatMap((set) =>
            isRecord(set) &&
            isFiniteNumber(set.weight) &&
            isFiniteNumber(set.reps)
              ? [{ weight: set.weight, reps: set.reps }]
              : [],
          ),
      });
    }
    templates.push({
      id: raw.id,
      name: raw.name,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
      exercises,
    });
  }

  const exerciseNotes: BackupExerciseNote[] = [];
  const rawNotes = Array.isArray(value.exerciseNotes)
    ? value.exerciseNotes
    : [];
  if (rawNotes.length > MAX_NOTES)
    return { ok: false, error: "That backup has too many exercise notes" };
  for (const raw of rawNotes) {
    if (!isRecord(raw)) continue;
    if (typeof raw.slug !== "string" || typeof raw.notes !== "string") continue;
    exerciseNotes.push({
      slug: raw.slug,
      notes: raw.notes,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
    });
  }

  const sessions: BackupSession[] = [];
  const rawSessions = Array.isArray(value.sessions) ? value.sessions : [];
  if (rawSessions.length > MAX_SESSIONS)
    return { ok: false, error: "That backup has too many workouts" };
  for (const raw of rawSessions) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string") continue;
    if (!SESSION_STATUSES.includes(raw.status as LocalSessionStatus)) continue;

    const rawExercises = Array.isArray(raw.exercises) ? raw.exercises : [];
    const exercises: BackupSessionExercise[] = [];
    for (const rawExercise of rawExercises.slice(
      0,
      MAX_EXERCISES_PER_SESSION,
    )) {
      if (!isRecord(rawExercise)) continue;
      if (
        typeof rawExercise.id !== "string" ||
        typeof rawExercise.slug !== "string"
      )
        continue;
      const rawSets = Array.isArray(rawExercise.sets) ? rawExercise.sets : [];
      const sets: BackupSet[] = [];
      for (const rawSet of rawSets.slice(0, MAX_SETS_PER_EXERCISE)) {
        if (!isRecord(rawSet) || typeof rawSet.id !== "string") continue;
        sets.push({
          id: rawSet.id,
          orderIndex: isFiniteNumber(rawSet.orderIndex)
            ? rawSet.orderIndex
            : sets.length,
          targetWeight: isFiniteNumber(rawSet.targetWeight)
            ? rawSet.targetWeight
            : 0,
          targetReps: isFiniteNumber(rawSet.targetReps) ? rawSet.targetReps : 0,
          weight: isFiniteNumber(rawSet.weight) ? rawSet.weight : 0,
          reps: isFiniteNumber(rawSet.reps) ? rawSet.reps : 0,
          completed: rawSet.completed === true,
          completedAt: isFiniteNumber(rawSet.completedAt)
            ? rawSet.completedAt
            : null,
        });
      }
      exercises.push({
        id: rawExercise.id,
        slug: rawExercise.slug,
        orderIndex: isFiniteNumber(rawExercise.orderIndex)
          ? rawExercise.orderIndex
          : exercises.length,
        restSeconds: isFiniteNumber(rawExercise.restSeconds)
          ? rawExercise.restSeconds
          : 75,
        notes: optionalString(rawExercise.notes),
        sets,
      });
    }

    sessions.push({
      id: raw.id,
      templateId: optionalString(raw.templateId),
      templateName:
        typeof raw.templateName === "string" ? raw.templateName : "Workout",
      status: raw.status as LocalSessionStatus,
      sessionKind:
        raw.sessionKind === "health_summary" ? "health_summary" : "tracked",
      startedAt: isFiniteNumber(raw.startedAt) ? raw.startedAt : 0,
      completedAt: isFiniteNumber(raw.completedAt) ? raw.completedAt : null,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
      countsTowardGoals: raw.countsTowardGoals !== false,
      externalProvider:
        raw.externalProvider === "apple_health" ? "apple_health" : null,
      externalId: optionalString(raw.externalId),
      activityType: optionalString(raw.activityType),
      sourceName: optionalString(raw.sourceName),
      sourceBundleId: optionalString(raw.sourceBundleId),
      durationSeconds: isFiniteNumber(raw.durationSeconds)
        ? raw.durationSeconds
        : null,
      energyKcal: isFiniteNumber(raw.energyKcal) ? raw.energyKcal : null,
      distanceMeters: isFiniteNumber(raw.distanceMeters)
        ? raw.distanceMeters
        : null,
      importedAt: isFiniteNumber(raw.importedAt) ? raw.importedAt : null,
      exercises,
    });
  }

  if (
    sessions.length === 0 &&
    templates.length === 0 &&
    customExercises.length === 0 &&
    exerciseNotes.length === 0
  ) {
    return { ok: false, error: "That backup is empty" };
  }

  return {
    ok: true,
    snapshot: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : Date.now(),
      preferences,
      customExercises,
      templates,
      exerciseNotes,
      sessions,
    },
  };
}

function validatePreferences(value: unknown): LocalPreferences {
  const raw = isRecord(value) ? value : {};
  return {
    unit: raw.unit === "kg" ? "kg" : "lb",
    barWeightLb: isFiniteNumber(raw.barWeightLb) ? raw.barWeightLb : 45,
    barWeightKg: isFiniteNumber(raw.barWeightKg) ? raw.barWeightKg : 20,
    activeWorkoutMode: raw.activeWorkoutMode === "focus" ? "focus" : "list",
    restTimerEnabled: raw.restTimerEnabled !== false,
  };
}

export type LocalRestoreResult = {
  sessionsAdded: number;
  templatesAdded: number;
  customExercisesAdded: number;
  notesAdded: number;
  /** Rows the phone already had — the second run of an idempotent restore. */
  skipped: number;
};

/**
 * Merge a snapshot into local SQLite. Nothing is deleted and nothing is
 * overwritten: `INSERT OR IGNORE` keyed on the original row ids means a row
 * the phone already has wins, so restoring is safe on a phone that isn't empty
 * and safe to repeat.
 *
 * A parent that's skipped skips its children too, which is what keeps a repeat
 * restore from duplicating the sets under a session that's already here.
 */
export async function restoreLocalBackup(
  db: SQLiteDatabase,
  snapshot: WorkoutBackupSnapshot,
): Promise<LocalRestoreResult> {
  const addedTemplateIds: string[] = [];
  const addedSessionIds: string[] = [];
  const addedCustomIds: string[] = [];
  let notesAdded = 0;
  let skipped = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    // Preferences are only adopted on a phone that has never had them set —
    // `updated_at` stays 0 until a sign-in bootstrap writes real ones. A
    // restore shouldn't quietly flip the units on an established install, and
    // leaving `updated_at` at 0 keeps a later bootstrap authoritative.
    const preferences = await txn.getFirstAsync<{ updated_at: number }>(
      "SELECT updated_at FROM local_preferences WHERE id = 1",
    );
    if ((preferences?.updated_at ?? 0) === 0) {
      await txn.runAsync(
        `UPDATE local_preferences
            SET unit = ?, bar_weight_lb = ?, bar_weight_kg = ?,
                active_workout_mode = ?, rest_timer_enabled = ?
          WHERE id = 1`,
        snapshot.preferences.unit,
        snapshot.preferences.barWeightLb,
        snapshot.preferences.barWeightKg,
        snapshot.preferences.activeWorkoutMode,
        snapshot.preferences.restTimerEnabled ? 1 : 0,
      );
    }

    // Lifts first: templates and sessions reference them by slug, and a slug
    // that already resolves locally is left pointing at the existing lift.
    for (const exercise of snapshot.customExercises) {
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO local_custom_exercises (
           id, slug, remote_id, name, short, category, uses_bar, archived,
           updated_at
         ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        exercise.id,
        exercise.slug,
        exercise.name,
        exercise.short,
        exercise.category,
        exercise.usesBar ? 1 : 0,
        exercise.archived ? 1 : 0,
        exercise.updatedAt,
      );
      if (result.changes > 0) addedCustomIds.push(exercise.id);
    }

    for (const template of snapshot.templates) {
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO local_templates (id, remote_id, name, updated_at)
         VALUES (?, ?, ?, ?)`,
        template.id,
        // Deterministic from the row id, so it reproduces exactly the
        // remote id an offline-created template already had.
        localTemplateRemoteId(template.id),
        template.name,
        template.updatedAt,
      );
      if (result.changes === 0) {
        skipped++;
        continue;
      }
      addedTemplateIds.push(template.id);
      for (const exercise of template.exercises) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO local_template_exercises (
             id, template_id, slug, order_index, sets_json
           ) VALUES (?, ?, ?, ?, ?)`,
          exercise.id,
          template.id,
          exercise.slug,
          exercise.orderIndex,
          JSON.stringify(exercise.sets),
        );
      }
    }

    for (const note of snapshot.exerciseNotes) {
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO local_exercise_notes (slug, notes, updated_at)
         VALUES (?, ?, ?)`,
        note.slug,
        note.notes,
        note.updatedAt,
      );
      if (result.changes > 0) notesAdded++;
    }

    // The app assumes at most one workout is in progress, so a backed-up
    // active workout is only restored onto a phone that isn't mid-session.
    const active = await txn.getFirstAsync<{ id: string }>(
      "SELECT id FROM local_sessions WHERE status = 'in_progress' LIMIT 1",
    );
    let activeTaken = active !== null;

    for (const session of snapshot.sessions) {
      if (session.status === "in_progress" && activeTaken) {
        skipped++;
        continue;
      }
      if (session.externalProvider && session.externalId) {
        const duplicate = await txn.getFirstAsync<{ id: string }>(
          `SELECT id FROM local_sessions
            WHERE external_provider = ? AND external_id = ?`,
          session.externalProvider,
          session.externalId,
        );
        if (duplicate) {
          skipped++;
          continue;
        }
      }
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO local_sessions (
           id, remote_id, template_id, remote_template_id, template_name,
           status, session_kind, started_at, completed_at, updated_at,
           counts_toward_goals, external_provider, external_id, activity_type,
           source_name, source_bundle_id, duration_seconds, energy_kcal,
           distance_meters, imported_at
         ) VALUES (
           ?, NULL,
           (SELECT id FROM local_templates WHERE id = ?),
           NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         )`,
        session.id,
        session.templateId,
        session.templateName,
        session.status,
        session.sessionKind === "health_summary" ? "health_summary" : "tracked",
        session.startedAt,
        session.completedAt,
        session.updatedAt,
        session.countsTowardGoals === false ? 0 : 1,
        session.externalProvider ?? null,
        session.externalId ?? null,
        session.activityType ?? null,
        session.sourceName ?? null,
        session.sourceBundleId ?? null,
        session.durationSeconds ?? null,
        session.energyKcal ?? null,
        session.distanceMeters ?? null,
        session.importedAt ?? null,
      );
      if (result.changes === 0) {
        skipped++;
        continue;
      }
      if (session.status === "in_progress") activeTaken = true;
      addedSessionIds.push(session.id);

      for (const exercise of session.exercises) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO local_session_exercises (
             id, session_id, slug, order_index, rest_seconds, notes
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          exercise.id,
          session.id,
          exercise.slug,
          exercise.orderIndex,
          exercise.restSeconds,
          exercise.notes,
        );
        for (const set of exercise.sets) {
          await txn.runAsync(
            `INSERT OR IGNORE INTO local_sets (
               id, session_exercise_id, order_index, target_weight,
               target_reps, weight, reps, completed, completed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            set.id,
            exercise.id,
            set.orderIndex,
            set.targetWeight,
            set.targetReps,
            set.weight,
            set.reps,
            set.completed ? 1 : 0,
            set.completedAt,
          );
        }
      }
    }
  });

  // Queued outside the transaction, like `applyIosBootstrap` does: the queue
  // helpers read back through `db`. Restored rows keep their ids, which double
  // as sync client ids, so signing in later uploads them without duplicating
  // anything the account already holds.
  const now = Date.now();
  for (const id of addedCustomIds)
    await queueCustomExerciseSnapshot(db, id, now);
  for (const id of addedTemplateIds) await queueTemplateSnapshot(db, id, now);
  for (const id of addedSessionIds) await queueSessionSnapshot(db, id, now);

  return {
    sessionsAdded: addedSessionIds.length,
    templatesAdded: addedTemplateIds.length,
    customExercisesAdded: addedCustomIds.length,
    notesAdded,
    skipped,
  };
}
