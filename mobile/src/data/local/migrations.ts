import type { SQLiteDatabase } from "expo-sqlite";

const DATABASE_VERSION = 6;

export async function migrateLocalDatabase(db: SQLiteDatabase) {
  await db.execAsync("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion > DATABASE_VERSION) {
    throw new Error(
      `Workout database version ${currentVersion} is newer than this app supports`,
    );
  }
  if (currentVersion === DATABASE_VERSION) return;

  await db.withTransactionAsync(async () => {
    if (currentVersion < 1) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_preferences (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          unit TEXT NOT NULL DEFAULT 'lb',
          bar_weight_lb REAL NOT NULL DEFAULT 45,
          bar_weight_kg REAL NOT NULL DEFAULT 20,
          active_workout_mode TEXT NOT NULL DEFAULT 'list',
          rest_timer_enabled INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL
        );

        INSERT OR IGNORE INTO local_preferences (
          id, unit, bar_weight_lb, bar_weight_kg, active_workout_mode,
          rest_timer_enabled, updated_at
        ) VALUES (1, 'lb', 45, 20, 'list', 1, 0);

        CREATE TABLE IF NOT EXISTS local_templates (
          id TEXT PRIMARY KEY NOT NULL,
          remote_id TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS local_template_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          template_id TEXT NOT NULL REFERENCES local_templates(id) ON DELETE CASCADE,
          slug TEXT NOT NULL,
          order_index INTEGER NOT NULL,
          sets_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS local_template_exercises_by_template
          ON local_template_exercises(template_id, order_index);

        CREATE TABLE IF NOT EXISTS local_exercise_notes (
          slug TEXT PRIMARY KEY NOT NULL,
          notes TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS local_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          remote_id TEXT UNIQUE,
          template_id TEXT REFERENCES local_templates(id) ON DELETE SET NULL,
          remote_template_id TEXT,
          template_name TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS local_sessions_by_status
          ON local_sessions(status, started_at DESC);

        CREATE TABLE IF NOT EXISTS local_session_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL REFERENCES local_sessions(id) ON DELETE CASCADE,
          slug TEXT NOT NULL,
          order_index INTEGER NOT NULL,
          rest_seconds INTEGER NOT NULL DEFAULT 75,
          notes TEXT
        );
        CREATE INDEX IF NOT EXISTS local_session_exercises_by_session
          ON local_session_exercises(session_id, order_index);

        CREATE TABLE IF NOT EXISTS local_sets (
          id TEXT PRIMARY KEY NOT NULL,
          session_exercise_id TEXT NOT NULL
            REFERENCES local_session_exercises(id) ON DELETE CASCADE,
          order_index INTEGER NOT NULL,
          target_weight REAL NOT NULL DEFAULT 0,
          target_reps INTEGER NOT NULL DEFAULT 0,
          weight REAL NOT NULL DEFAULT 0,
          reps INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          completed_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS local_sets_by_exercise
          ON local_sets(session_exercise_id, order_index);

        CREATE TABLE IF NOT EXISTS local_sync_outbox (
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          operation_id TEXT NOT NULL UNIQUE,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (entity_type, entity_id)
        );
        CREATE INDEX IF NOT EXISTS local_sync_outbox_by_created
          ON local_sync_outbox(created_at);

        CREATE TABLE IF NOT EXISTS local_metadata (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        PRAGMA user_version = 1;
      `);
    }

    if (currentVersion < 2) {
      // Custom lifts authored on the phone. `remote_id` stays NULL until the
      // lift reaches Convex, at which point `slug` is rewritten from its
      // provisional `custom:local-…` form to the durable `custom:<id>` form.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_custom_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          remote_id TEXT UNIQUE,
          name TEXT NOT NULL,
          short TEXT,
          category TEXT NOT NULL,
          uses_bar INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS local_custom_exercises_by_archived
          ON local_custom_exercises(archived, name);

        PRAGMA user_version = 2;
      `);
    }

    if (currentVersion < 3) {
      await db.execAsync(`
        ALTER TABLE local_sessions ADD COLUMN session_kind TEXT NOT NULL DEFAULT 'tracked';
        ALTER TABLE local_sessions ADD COLUMN external_provider TEXT;
        ALTER TABLE local_sessions ADD COLUMN external_id TEXT;
        ALTER TABLE local_sessions ADD COLUMN activity_type TEXT;
        ALTER TABLE local_sessions ADD COLUMN source_name TEXT;
        ALTER TABLE local_sessions ADD COLUMN source_bundle_id TEXT;
        ALTER TABLE local_sessions ADD COLUMN duration_seconds REAL;
        ALTER TABLE local_sessions ADD COLUMN energy_kcal REAL;
        ALTER TABLE local_sessions ADD COLUMN distance_meters REAL;
        ALTER TABLE local_sessions ADD COLUMN counts_toward_goals INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE local_sessions ADD COLUMN imported_at INTEGER;

        CREATE UNIQUE INDEX IF NOT EXISTS local_sessions_by_external
          ON local_sessions(external_provider, external_id)
          WHERE external_provider IS NOT NULL AND external_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS local_health_ignored (
          external_id TEXT PRIMARY KEY NOT NULL,
          ignored_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS local_health_state (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        PRAGMA user_version = 3;
      `);
    }

    if (currentVersion < 4) {
      await db.execAsync(`
        ALTER TABLE local_sessions ADD COLUMN health_export_pending INTEGER NOT NULL DEFAULT 0;
        PRAGMA user_version = 4;
      `);
    }

    if (currentVersion < 5) {
      await db.execAsync(`
        ALTER TABLE local_preferences
          ADD COLUMN rest_timer_notifications_enabled INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE local_preferences
          ADD COLUMN apple_health_import_notifications_enabled INTEGER NOT NULL DEFAULT 0;
        PRAGMA user_version = 5;
      `);
    }

    if (currentVersion < 6) {
      await db.execAsync(`
        ALTER TABLE local_sessions ADD COLUMN health_segments_json TEXT;
        PRAGMA user_version = 6;
      `);
    }
  });
}
