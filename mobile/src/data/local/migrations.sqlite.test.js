import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { migrateLocalDatabase } from "./migrations";

const databases = [];
function fixture() {
  const sql = new DatabaseSync(":memory:");
  databases.push(sql);
  const db = {
    execAsync: async (statement) => sql.exec(statement),
    getFirstAsync: async (statement) => sql.prepare(statement).get() ?? null,
    withTransactionAsync: async (operation) => {
      sql.exec("BEGIN");
      try {
        await operation();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sql, db };
}
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function sessionRows(sql) {
  return sql.prepare("SELECT * FROM local_sessions ORDER BY id").all();
}

describe("local schema compatibility using SQLite", () => {
  it("upgrades version 7 without changing existing workout fields", async () => {
    const { sql, db } = fixture();
    sql.exec(`
      CREATE TABLE local_sessions (
        id TEXT PRIMARY KEY, template_name TEXT, status TEXT,
        started_at INTEGER, updated_at INTEGER
      );
      INSERT INTO local_sessions VALUES ('active', 'Push day', 'in_progress', 100, 200);
      PRAGMA user_version = 7;
    `);
    await migrateLocalDatabase(db);
    expect(sql.prepare("PRAGMA user_version").get().user_version).toBe(8);
    expect(sessionRows(sql)).toEqual([
      {
        id: "active",
        template_name: "Push day",
        status: "in_progress",
        started_at: 100,
        updated_at: 200,
        input_mode: "list",
        note_body: null,
        note_unit: null,
      },
    ]);
  });

  it("opens an existing version 8 database without changing workouts, notes, sets or queued sync", async () => {
    const { sql, db } = fixture();
    await migrateLocalDatabase(db);
    sql.exec(`
      INSERT INTO local_sessions (id, template_name, status, started_at, updated_at)
        VALUES ('active', 'Push day', 'in_progress', 100, 200);
      INSERT INTO local_sessions (id, template_name, status, started_at, updated_at, input_mode, note_body, note_unit)
        VALUES ('note', 'Note workout', 'completed', 50, 90, 'note', 'Squat 100kg x 5', 'kg');
      INSERT INTO local_session_exercises (id, session_id, slug, order_index)
        VALUES ('lift', 'active', 'squat', 0);
      INSERT INTO local_sets (id, session_exercise_id, order_index, weight, reps, completed)
        VALUES ('set', 'lift', 0, 100, 5, 1);
      INSERT INTO local_sync_outbox (entity_type, entity_id, operation_id, payload_json, created_at)
        VALUES ('session', 'note', 'op-note', '{"inputMode":"note","noteBody":"Squat 100kg x 5"}', 90);
    `);
    const before = {
      sessions: sessionRows(sql),
      sets: sql.prepare("SELECT * FROM local_sets").all(),
      outbox: sql.prepare("SELECT * FROM local_sync_outbox").all(),
    };
    await migrateLocalDatabase(db);
    expect(sql.prepare("PRAGMA user_version").get().user_version).toBe(8);
    expect({
      sessions: sessionRows(sql),
      sets: sql.prepare("SELECT * FROM local_sets").all(),
      outbox: sql.prepare("SELECT * FROM local_sync_outbox").all(),
    }).toEqual(before);
  });

  it("still refuses an unknown future schema without rewriting it", async () => {
    const { sql, db } = fixture();
    sql.exec(
      "CREATE TABLE keep_me (value TEXT); INSERT INTO keep_me VALUES ('saved'); PRAGMA user_version = 9;",
    );
    await expect(migrateLocalDatabase(db)).rejects.toThrow(
      "Workout database version 9 is newer than this app supports",
    );
    expect(sql.prepare("PRAGMA user_version").get().user_version).toBe(9);
    expect(sql.prepare("SELECT value FROM keep_me").get().value).toBe("saved");
  });
});
