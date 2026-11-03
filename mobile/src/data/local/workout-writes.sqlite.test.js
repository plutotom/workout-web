import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
import { migrateLocalDatabase } from "./migrations";
import {
  addLocalExercise,
  completeSessionSync,
  getLocalWorkout,
  getPendingSessionSync,
  noteSessionSyncAttempt,
  startLocalBlankWorkout,
  updateLocalSet,
} from "./repository";

const databases = [];

function sqliteLocked() {
  return new Error(
    "FunctionCallException: Calling the 'finalizeAsync' function has failed (at ExpoModulesCore/AsyncFunctionDefinition.swift:123) -> Caused by: SQLiteErrorException: Error code 5: database is locked (at ExpoSQLite/SQLiteModule.swift:471)",
  );
}

async function fixture() {
  const sql = new DatabaseSync(":memory:");
  databases.push(sql);
  async function transaction(operation) {
    sql.exec("BEGIN");
    try {
      await operation();
      sql.exec("COMMIT");
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  }
  let exclusiveImpl = (operation) => transaction(() => operation(db));
  let runImpl = (statement, ...values) =>
    sql.prepare(statement).run(...values.flat());
  const db = {
    execAsync: async (statement) => sql.exec(statement),
    runAsync: async (statement, ...values) => runImpl(statement, ...values),
    getFirstAsync: async (statement, ...values) =>
      sql.prepare(statement).get(...values.flat()) ?? null,
    getAllAsync: async (statement, ...values) =>
      sql.prepare(statement).all(...values.flat()),
    withTransactionAsync: async (operation) => transaction(operation),
    withExclusiveTransactionAsync: async (operation) =>
      exclusiveImpl(operation),
  };
  await migrateLocalDatabase(db);
  return {
    db,
    sql,
    setExclusiveImpl(next) {
      exclusiveImpl = next;
    },
    lockExclusives() {
      let holders = 0;
      exclusiveImpl = async (operation) => {
        if (holders > 0) throw sqliteLocked();
        holders += 1;
        try {
          await new Promise((resolve) => setTimeout(resolve, 25));
          await transaction(() => operation(db));
        } finally {
          holders -= 1;
        }
      };
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const sql of databases.splice(0)) sql.close();
});

async function livePullUp(db) {
  const sessionId = await startLocalBlankWorkout(db);
  await addLocalExercise(db, sessionId, "pull-up", [
    { weight: 0, reps: 5 },
    { weight: 0, reps: 5 },
  ]);
  const workout = await getLocalWorkout(db, sessionId);
  return {
    sessionId,
    setId: workout.exercises[0].sets[1]._id,
  };
}

it("does not throw database is locked or drop a set edit that overlaps outbox drain", async () => {
  const { db, sql, lockExclusives } = await fixture();
  const { sessionId, setId } = await livePullUp(db);
  const pending = await getPendingSessionSync(db);
  expect(pending.sessionId).toBe(sessionId);
  lockExclusives();

  await Promise.all([
    updateLocalSet(db, setId, { reps: 8 }),
    completeSessionSync(db, pending.operationId, sessionId, "remote-session"),
    noteSessionSyncAttempt(db, pending.operationId),
  ]);

  const workout = await getLocalWorkout(db, sessionId);
  expect(workout.exercises[0].sets[1].reps).toBe(8);
  expect(
    sql
      .prepare("SELECT remote_id FROM local_sessions WHERE id = ?")
      .get(sessionId).remote_id,
  ).toBe("remote-session");
  const outbox = sql
    .prepare(
      "SELECT payload_json FROM local_sync_outbox WHERE entity_type = 'session'",
    )
    .all();
  for (const row of outbox) {
    expect(JSON.parse(row.payload_json).exercises[0].sets[1].reps).toBe(8);
  }
});

it("retries a locked set save so the typed reps are not dropped", async () => {
  const { db, sql, setExclusiveImpl } = await fixture();
  const { setId } = await livePullUp(db);
  let attempts = 0;
  const previous = async (operation) => {
    sql.exec("BEGIN");
    try {
      await operation(db);
      sql.exec("COMMIT");
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  };
  setExclusiveImpl(async (operation) => {
    attempts += 1;
    if (attempts === 1) throw sqliteLocked();
    return previous(operation);
  });

  await updateLocalSet(db, setId, { reps: 8 });

  expect(attempts).toBeGreaterThan(1);
  expect(
    sql.prepare("SELECT reps FROM local_sets WHERE id = ?").get(setId).reps,
  ).toBe(8);
});
