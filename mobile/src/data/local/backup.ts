import type { SQLiteDatabase } from "expo-sqlite";

import {
  getLocalPreferences,
  queueCustomExerciseSnapshot,
  queueSessionSnapshot,
  queueTemplateSnapshot,
} from "@/data/local/repository";
import type {
  LocalMuscleGroup,
  LocalSessionKind,
  LocalSessionStatus,
  LocalTemplateSet,
} from "@/data/local/types";
import {
  isUnsyncedTemplateRemoteId,
  localTemplateRemoteId,
} from "@/data/local/types";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  parseBackup,
  serializeBackup,
  validateBackup,
  type BackupParseResult,
  type WorkoutBackupSnapshot,
} from "@shared/workout-backup";

/**
 * SQLite read/restore for the phone-database snapshot. The wire format lives in
 * `@shared/workout-backup` so web can parse the same file (and turn it into a
 * portable bundle of templates).
 */

export {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  parseBackup,
  serializeBackup,
  validateBackup,
  type BackupParseResult,
  type WorkoutBackupSnapshot,
};

const MUSCLE_GROUPS: readonly LocalMuscleGroup[] = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "core",
];

type TemplateRow = {
  id: string;
  remote_id: string;
  name: string;
  updated_at: number;
  last_place_id: string | null;
};
type PlaceRow = {
  id: string;
  remote_id: string | null;
  name: string;
  starred: number;
  archived: number;
  last_used_at: number | null;
  updated_at: number;
};
type MachineRow = {
  id: string;
  remote_id: string | null;
  place_id: string;
  exercise_slug: string;
  name: string;
  is_default: number;
  archived: number;
  last_used_at: number | null;
  updated_at: number;
};
type PlaceWeightRow = {
  place_id: string;
  exercise_slug: string;
  machine_key: string;
  sets_json: string;
  updated_at: number;
};
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
  remote_id: string | null;
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
  remote_id: string | null;
  template_id: string | null;
  remote_template_id: string | null;
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
  place_id: string | null;
  place_name: string | null;
};
type SessionExerciseRow = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
    `SELECT id, slug, remote_id, name, short, category, uses_bar, archived,
            updated_at
       FROM local_custom_exercises
      ORDER BY name`,
  );
  const noteRows = await db.getAllAsync<NoteRow>(
    "SELECT slug, notes, updated_at FROM local_exercise_notes ORDER BY slug",
  );
  const templateRows = await db.getAllAsync<TemplateRow>(
    `SELECT id, remote_id, name, updated_at, last_place_id
       FROM local_templates
      ORDER BY name`,
  );
  const templateExerciseRows = await db.getAllAsync<TemplateExerciseRow>(
    `SELECT id, template_id, slug, order_index, sets_json
       FROM local_template_exercises
      ORDER BY template_id, order_index`,
  );
  const sessionRows = await db.getAllAsync<SessionRow>(
    `SELECT id, remote_id, template_id, remote_template_id, template_name,
            status, session_kind, started_at, completed_at, updated_at,
            counts_toward_goals, external_provider, external_id, activity_type,
            source_name, source_bundle_id, duration_seconds, energy_kcal,
            distance_meters, imported_at, place_id, place_name
       FROM local_sessions
      ORDER BY started_at`,
  );
  const sessionExerciseRows = await db.getAllAsync<SessionExerciseRow>(
    `SELECT id, session_id, slug, order_index, rest_seconds, notes,
            machine_id, machine_name
       FROM local_session_exercises
      ORDER BY session_id, order_index`,
  );
  const setRows = await db.getAllAsync<SetRow>(
    `SELECT id, session_exercise_id, order_index, target_weight, target_reps,
            weight, reps, completed, completed_at
       FROM local_sets
      ORDER BY session_exercise_id, order_index`,
  );
  const placeRows = await db.getAllAsync<PlaceRow>(
    `SELECT id, remote_id, name, starred, archived, last_used_at, updated_at
       FROM local_places
      ORDER BY starred DESC, name`,
  );
  const machineRows = await db.getAllAsync<MachineRow>(
    `SELECT id, remote_id, place_id, exercise_slug, name, is_default,
            archived, last_used_at, updated_at
       FROM local_machines
      ORDER BY place_id, exercise_slug, name`,
  );
  const placeWeightRows = await db.getAllAsync<PlaceWeightRow>(
    `SELECT place_id, exercise_slug, machine_key, sets_json, updated_at
       FROM local_exercise_place_weights
      ORDER BY place_id, exercise_slug, machine_key`,
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
      remoteId: row.remote_id,
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
      remoteId: row.remote_id,
      name: row.name,
      updatedAt: row.updated_at,
      lastPlaceId: row.last_place_id,
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
      remoteId: row.remote_id,
      templateId: row.template_id,
      remoteTemplateId: row.remote_template_id,
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
      placeId: row.place_id,
      placeName: row.place_name,
      exercises: (exercisesBySession.get(row.id) ?? []).map((exercise) => ({
        id: exercise.id,
        slug: exercise.slug,
        orderIndex: exercise.order_index,
        restSeconds: exercise.rest_seconds,
        notes: exercise.notes,
        machineId: exercise.machine_id,
        machineName: exercise.machine_name,
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
    places: placeRows.map((row) => ({
      id: row.id,
      remoteId: row.remote_id,
      name: row.name,
      starred: row.starred === 1,
      archived: row.archived === 1,
      lastUsedAt: row.last_used_at,
      updatedAt: row.updated_at,
    })),
    machines: machineRows.map((row) => ({
      id: row.id,
      remoteId: row.remote_id,
      placeId: row.place_id,
      exerciseSlug: row.exercise_slug,
      name: row.name,
      isDefault: row.is_default === 1,
      archived: row.archived === 1,
      lastUsedAt: row.last_used_at,
      updatedAt: row.updated_at,
    })),
    placeWeights: placeWeightRows.map((row) => ({
      placeId: row.place_id,
      exerciseSlug: row.exercise_slug,
      machineKey: row.machine_key,
      sets: parseTemplateSets(row.sets_json),
      updatedAt: row.updated_at,
    })),
  };
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
  const customIdsToSync: string[] = [];
  const templateIdsToSync: string[] = [];
  const sessionIdsToSync: string[] = [];
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
                active_workout_mode = ?, rest_timer_enabled = ?,
                rest_timer_notifications_enabled = ?,
                apple_health_import_notifications_enabled = ?
          WHERE id = 1`,
        snapshot.preferences.unit,
        snapshot.preferences.barWeightLb,
        snapshot.preferences.barWeightKg,
        snapshot.preferences.activeWorkoutMode,
        snapshot.preferences.restTimerEnabled ? 1 : 0,
        snapshot.preferences.restTimerNotificationsEnabled ? 1 : 0,
        snapshot.preferences.appleHealthImportNotificationsEnabled ? 1 : 0,
      );
    }

    // Lifts first: templates and sessions reference them by slug, and a slug
    // that already resolves locally is left pointing at the existing lift.
    for (const exercise of snapshot.customExercises) {
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO local_custom_exercises (
         id, slug, remote_id, name, short, category, uses_bar, archived,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        exercise.id,
        exercise.slug,
        exercise.remoteId ?? null,
        exercise.name,
        exercise.short,
        exercise.category,
        exercise.usesBar ? 1 : 0,
        exercise.archived ? 1 : 0,
        exercise.updatedAt,
      );
      if (result.changes > 0) {
        addedCustomIds.push(exercise.id);
        if (!exercise.remoteId) customIdsToSync.push(exercise.id);
      } else {
        skipped++;
      }
    }

    for (const place of snapshot.places ?? []) {
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO local_places (
           id, remote_id, name, starred, archived, last_used_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        place.id,
        place.remoteId ?? null,
        place.name,
        place.starred ? 1 : 0,
        place.archived ? 1 : 0,
        place.lastUsedAt,
        place.updatedAt,
      );
      if (result.changes === 0) skipped++;
    }

    for (const machine of snapshot.machines ?? []) {
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO local_machines (
           id, remote_id, place_id, exercise_slug, name, is_default,
           archived, last_used_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        machine.id,
        machine.remoteId ?? null,
        machine.placeId,
        machine.exerciseSlug,
        machine.name,
        machine.isDefault ? 1 : 0,
        machine.archived ? 1 : 0,
        machine.lastUsedAt,
        machine.updatedAt,
      );
      if (result.changes === 0) skipped++;
    }

    for (const weight of snapshot.placeWeights ?? []) {
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO local_exercise_place_weights (
           place_id, exercise_slug, machine_key, sets_json, updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
        weight.placeId,
        weight.exerciseSlug,
        weight.machineKey,
        JSON.stringify(weight.sets),
        weight.updatedAt,
      );
      if (result.changes === 0) skipped++;
    }

    for (const template of snapshot.templates) {
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO local_templates (
           id, remote_id, name, updated_at, last_place_id
         ) VALUES (?, ?, ?, ?, ?)`,
        template.id,
        // Older backups didn't carry this field. Rebuild the phone-only id
        // they used so their existing sync/idempotency behavior is unchanged.
        template.remoteId ?? localTemplateRemoteId(template.id),
        template.name,
        template.updatedAt,
        template.lastPlaceId ?? null,
      );
      if (result.changes === 0) {
        skipped++;
        continue;
      }
      addedTemplateIds.push(template.id);
      if (!template.remoteId || isUnsyncedTemplateRemoteId(template.remoteId)) {
        templateIdsToSync.push(template.id);
      }
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
      else skipped++;
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
           distance_meters, imported_at, place_id, place_name
         ) VALUES (
           ?, ?,
           COALESCE(
             (SELECT id FROM local_templates WHERE id = ?),
             (SELECT id FROM local_templates WHERE remote_id = ?)
           ),
           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         )`,
        session.id,
        session.remoteId ?? null,
        session.templateId,
        session.remoteTemplateId ?? null,
        session.remoteTemplateId ?? null,
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
        session.placeId ?? null,
        session.placeName ?? null,
      );
      if (result.changes === 0) {
        skipped++;
        continue;
      }
      if (session.status === "in_progress") activeTaken = true;
      addedSessionIds.push(session.id);
      if (!session.remoteId) sessionIdsToSync.push(session.id);

      for (const exercise of session.exercises) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO local_session_exercises (
             id, session_id, slug, order_index, rest_seconds, notes,
             machine_id, machine_name
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          exercise.id,
          session.id,
          exercise.slug,
          exercise.orderIndex,
          exercise.restSeconds,
          exercise.notes,
          exercise.machineId ?? null,
          exercise.machineName ?? null,
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
  // helpers read back through `db`. Local-only rows still need uploading;
  // account-backed rows keep their real remote ids and must not be recreated.
  const now = Date.now();
  for (const id of customIdsToSync)
    await queueCustomExerciseSnapshot(db, id, now);
  for (const id of templateIdsToSync) await queueTemplateSnapshot(db, id, now);
  for (const id of sessionIdsToSync) await queueSessionSnapshot(db, id, now);

  return {
    sessionsAdded: addedSessionIds.length,
    templatesAdded: addedTemplateIds.length,
    customExercisesAdded: addedCustomIds.length,
    notesAdded,
    skipped,
  };
}
