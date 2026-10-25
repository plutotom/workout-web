import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
import { migrateLocalDatabase } from "./migrations";
import {
  applyIosBootstrap,
  getPendingCustomExerciseSync,
  getPendingSessionSync,
  queueCustomExerciseSnapshot,
  queueSessionSnapshot,
} from "./repository";

const databases = [];
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
  const db = {
    execAsync: async (statement) => sql.exec(statement),
    runAsync: async (statement, ...values) =>
      sql.prepare(statement).run(...values.flat()),
    getFirstAsync: async (statement, ...values) =>
      sql.prepare(statement).get(...values.flat()) ?? null,
    getAllAsync: async (statement, ...values) =>
      sql.prepare(statement).all(...values.flat()),
    withTransactionAsync: async (operation) => transaction(operation),
    withExclusiveTransactionAsync: async (operation) =>
      transaction(() => operation(db)),
  };
  await migrateLocalDatabase(db);
  return { db, sql };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const sql of databases) sql.close();
  databases.length = 0;
});
const lift = (remoteId, clientId, archived = false) => ({
  remoteId,
  clientId,
  name: "Fixture raise",
  short: null,
  category: "shoulders",
  usesBar: false,
  archived,
});
const payload = (customExercises) => ({
  serverTime: 50,
  preferences: {
    unit: "lb",
    barWeightLb: 45,
    barWeightKg: 20,
    activeWorkoutMode: "list",
    restTimerEnabled: true,
  },
  templates: [],
  places: [],
  machines: [],
  placeWeights: [],
  exerciseNotes: [],
  customExercises,
});
async function staleDraftFixture() {
  const fixtureData = await fixture();
  const { db, sql } = fixtureData;
  await seed(db, "cloud-a");
  sql.exec(`
    INSERT INTO local_templates (id, remote_id, name, updated_at)
      VALUES ('template', 'local:template', 'Fixture', 1);
    INSERT INTO local_template_exercises (id, template_id, slug, order_index, sets_json)
      VALUES ('template-lift', 'template', 'custom:local-cloud-a', 0, '[{"weight":0,"reps":1}]');
    INSERT INTO local_sessions (id, template_id, template_name, status, started_at, completed_at, updated_at)
      VALUES ('session', 'template', 'Fixture', 'completed', 100, 200, 200);
    INSERT INTO local_session_exercises (id, session_id, slug, order_index)
      VALUES ('session-lift', 'session', 'custom:local-cloud-a', 0);
    INSERT INTO local_sets (id, session_exercise_id, order_index, weight, reps, completed)
      VALUES ('set', 'session-lift', 0, 0, 1, 1);
  `);
  await queueSessionSnapshot(db, "session", 200);
  return fixtureData;
}
async function seed(db, remoteId) {
  await db.runAsync(
    "INSERT INTO local_custom_exercises (id, slug, remote_id, name, category, uses_bar, archived, updated_at) VALUES ('cloud-a', ?, ?, 'Fixture raise', 'shoulders', 0, 0, 1)",
    `custom:${remoteId}`,
    remoteId,
  );
  await queueCustomExerciseSnapshot(db, "cloud-a", 1);
}

it.each([false, true])(
  "repairs an occupied cloud id without stealing either lift or dropping its queued edit (reverse: %s)",
  async (reverse) => {
    const { db } = await fixture();
    await seed(db, "cloud-b");
    const queued = await getPendingCustomExerciseSync(db);
    const rows = [
      lift("cloud-a", "first-phone"),
      lift("cloud-b", "cloud-a", true),
    ];
    if (reverse) rows.reverse();
    await applyIosBootstrap(db, payload(rows));
    const after = await db.getAllAsync(
      "SELECT id, remote_id, slug FROM local_custom_exercises ORDER BY remote_id",
    );
    expect(after).toHaveLength(2);
    expect(after[0]).toMatchObject({
      remote_id: "cloud-a",
      slug: "custom:cloud-a",
    });
    expect(after[0].id).not.toBe("cloud-a");
    expect(after[1]).toEqual({
      id: "cloud-a",
      remote_id: "cloud-b",
      slug: "custom:cloud-b",
    });
    expect(await getPendingCustomExerciseSync(db)).toEqual(queued);
    await applyIosBootstrap(db, payload([...rows].reverse()));
    expect(
      await db.getAllAsync(
        "SELECT id, remote_id, slug FROM local_custom_exercises ORDER BY remote_id",
      ),
    ).toEqual(after);
    expect(await getPendingCustomExerciseSync(db)).toEqual(queued);
  },
);

it.each([false, true])(
  "does not rebind an intact cloud lift through another lift's client id (reverse: %s)",
  async (reverse) => {
    const { db } = await fixture();
    await seed(db, "cloud-a");
    const rows = [
      lift("cloud-a", "first-phone"),
      lift("cloud-b", "cloud-a", true),
    ];
    if (reverse) rows.reverse();
    await applyIosBootstrap(db, payload(rows));
    expect(
      await db.getAllAsync(
        "SELECT id, remote_id, slug FROM local_custom_exercises ORDER BY remote_id",
      ),
    ).toEqual([
      { id: "cloud-a", remote_id: "cloud-a", slug: "custom:cloud-a" },
      { id: "cloud-b", remote_id: "cloud-b", slug: "custom:cloud-b" },
    ]);
  },
);

it("rolls back interrupted identity repair and preserves its durable operation for retry", async () => {
  const { db } = await fixture();
  await seed(db, "cloud-b");
  const queued = await getPendingCustomExerciseSync(db);
  expect(queued.snapshot.remoteId).toBe("cloud-b");
  const original = db.runAsync;
  const failure = vi
    .spyOn(db, "runAsync")
    .mockImplementation(async (statement, ...values) => {
      const result = await original(statement, ...values);
      if (statement.includes("INSERT INTO local_custom_exercises"))
        throw new Error("Interrupted bootstrap");
      return result;
    });
  await expect(
    applyIosBootstrap(db, payload([lift("cloud-a", "first-phone")])),
  ).rejects.toThrow("Interrupted bootstrap");
  failure.mockRestore();
  expect(
    await db.getAllAsync("SELECT id, remote_id FROM local_custom_exercises"),
  ).toEqual([{ id: "cloud-a", remote_id: "cloud-b" }]);
  expect(await getPendingCustomExerciseSync(db)).toEqual(queued);
  await applyIosBootstrap(db, payload([lift("cloud-a", "first-phone")]));
  expect(
    await db.getAllAsync("SELECT id FROM local_custom_exercises"),
  ).toHaveLength(2);
});

it("repairs already-saved stale drafts while preserving workout/set identities and completion", async () => {
  const { db, sql } = await staleDraftFixture();
  const before = await getPendingSessionSync(db);
  await applyIosBootstrap(db, payload([lift("cloud-a", "cloud-a")]));
  expect(
    sql.prepare("SELECT id, slug FROM local_session_exercises").all(),
  ).toEqual([{ id: "session-lift", slug: "custom:cloud-a" }]);
  expect(
    sql.prepare("SELECT id, slug FROM local_template_exercises").all(),
  ).toEqual([{ id: "template-lift", slug: "custom:cloud-a" }]);
  expect(sql.prepare("SELECT id FROM local_sets").get().id).toBe("set");
  const session = sql
    .prepare(
      "SELECT completed_at, updated_at, health_export_pending FROM local_sessions",
    )
    .get();
  expect(session.completed_at).toBe(200);
  expect(session.updated_at).toBeGreaterThan(200);
  expect(session.health_export_pending).toBe(0);
  const after = await getPendingSessionSync(db);
  expect(after.operationId).not.toBe(before.operationId);
  expect(after.snapshot.exercises[0].slug).toBe("custom:cloud-a");
});

it("rolls back stale draft repair and revision if its replacement outbox cannot commit", async () => {
  const { db, sql } = await staleDraftFixture();
  const before = await getPendingSessionSync(db);
  const original = db.runAsync;
  const failure = vi
    .spyOn(db, "runAsync")
    .mockImplementation(async (statement, ...values) => {
      if (
        statement.includes("INSERT INTO local_sync_outbox") &&
        statement.includes("'session'")
      )
        throw new Error("Interrupted replacement snapshot");
      return original(statement, ...values);
    });
  await expect(
    applyIosBootstrap(db, payload([lift("cloud-a", "cloud-a")])),
  ).rejects.toThrow("Interrupted replacement snapshot");
  failure.mockRestore();
  expect(
    sql.prepare("SELECT slug FROM local_session_exercises").get().slug,
  ).toBe("custom:local-cloud-a");
  expect(
    sql.prepare("SELECT updated_at FROM local_sessions").get().updated_at,
  ).toBe(200);
  expect(await getPendingSessionSync(db)).toEqual(before);
  await applyIosBootstrap(db, payload([lift("cloud-a", "cloud-a")]));
  expect((await getPendingSessionSync(db)).snapshot.exercises[0].slug).toBe(
    "custom:cloud-a",
  );
});
