import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
import { migrateLocalDatabase } from "./migrations";
import {
  applyIosBootstrap,
  getPendingCustomExerciseSync,
  queueCustomExerciseSnapshot,
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
