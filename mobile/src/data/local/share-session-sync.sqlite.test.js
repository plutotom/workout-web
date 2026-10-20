import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
import { migrateLocalDatabase } from "./migrations";
import {
  completeTemplateSync,
  finishLocalWorkout,
  getLocalSessionShareOutboxAttempt,
  getLocalWorkout,
  getPendingSessionSync,
  retryLocalSessionShareSync,
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

it("finishes with a newer revision than a last-set timestamp so share sync is not stale-acked", async () => {
  const { db } = await fixture();
  const now = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockReturnValue(now);
  await db.runAsync(
    `INSERT INTO local_sessions (id, template_name, status, started_at, updated_at)
     VALUES ('local-1', 'Push', 'in_progress', ?, ?)`,
    now - 60_000,
    now + 5_000,
  );
  await finishLocalWorkout(db, "local-1");
  const session = await getLocalWorkout(db, "local-1");
  const pending = await getPendingSessionSync(db);
  expect(session?.status).toBe("completed");
  expect(session?.updatedAt).toBe(now + 5_001);
  expect(pending?.snapshot.status).toBe("completed");
  expect(pending?.snapshot.updatedAt).toBe(now + 5_001);
  expect(pending?.snapshot.clientId).toBe("local-1");
});

it("re-queues a completed workout after a stale in-progress ack emptied the outbox", async () => {
  const { db } = await fixture();
  await db.runAsync(
    `INSERT INTO local_sessions (id, remote_id, template_name, status, started_at, completed_at, updated_at)
     VALUES ('local-1', 'remote-1', 'Push', 'completed', 1, 2, 10)`,
  );
  expect(await getLocalSessionShareOutboxAttempt(db, "local-1")).toBe(null);
  await retryLocalSessionShareSync(db, "local-1");
  const pending = await getPendingSessionSync(db);
  expect(await getLocalSessionShareOutboxAttempt(db, "local-1")).toBe(0);
  expect(pending?.snapshot.status).toBe("completed");
  expect(pending?.snapshot.updatedAt).toBeGreaterThan(10);
  expect(pending?.snapshot.remoteId).toBe("remote-1");
});

it("relinks a finished workout to a newly synced template without rewinding its revision", async () => {
  const { db } = await fixture();
  const now = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockReturnValue(now);
  await db.runAsync(
    `INSERT INTO local_templates (id, remote_id, name, updated_at)
     VALUES ('tmpl-1', 'local:tmpl-1', 'Push', 1)`,
  );
  await db.runAsync(
    `INSERT INTO local_sessions (id, template_id, template_name, status, started_at, completed_at, updated_at)
     VALUES ('local-1', 'tmpl-1', 'Push', 'completed', 1, 2, ?)`,
    now + 5_000,
  );
  await db.runAsync(
    `INSERT INTO local_sync_outbox (entity_type, entity_id, operation_id, payload_json, created_at, attempt_count)
     VALUES ('template', 'tmpl-1', 'tmpl-op', '{}', 1, 0)`,
  );
  await completeTemplateSync(db, "tmpl-op", "tmpl-1", "cloud-tmpl");
  const session = await getLocalWorkout(db, "local-1");
  const pending = await getPendingSessionSync(db);
  expect(session?.remoteTemplateId).toBe("cloud-tmpl");
  expect(session?.updatedAt).toBe(now + 5_001);
  expect(pending?.snapshot.remoteTemplateId).toBe("cloud-tmpl");
  expect(pending?.snapshot.updatedAt).toBe(now + 5_001);
});
