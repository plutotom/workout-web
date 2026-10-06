import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
import { migrateLocalDatabase } from "./migrations";
import {
  applyIosBootstrap,
  completeTemplateSync,
  getLocalTemplate,
  getPendingTemplateSync,
  saveLocalTemplate,
} from "./repository";
const databases = [];
async function fixture() {
  const sql = new DatabaseSync(":memory:");
  databases.push(sql);
  sql.exec("PRAGMA foreign_keys = ON");
  const adapter = {
    execAsync: async (statement) => sql.exec(statement),
    runAsync: async (statement, ...values) =>
      sql.prepare(statement).run(...values),
    getFirstAsync: async (statement, ...values) =>
      sql.prepare(statement).get(...values) ?? null,
    getAllAsync: async (statement, ...values) =>
      sql.prepare(statement).all(...values),
    withTransactionAsync: async (operation) => transaction(operation),
    withExclusiveTransactionAsync: async (operation) =>
      transaction(() => operation(db)),
  };
  const db = adapter;
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
  await migrateLocalDatabase(db);
  const templateId = await saveLocalTemplate(db, {
    name: "Push",
    exercises: [{ slug: "bench", sets: [{ weight: 100, reps: 5 }] }],
  });
  const pending = await getPendingTemplateSync(db);
  return { sql, db, templateId, pending };
}
function bootstrap() {
  return {
    serverTime: 1e3,
    preferences: {
      unit: "lb",
      barWeightLb: 45,
      barWeightKg: 20,
      activeWorkoutMode: "list",
      restTimerEnabled: true,
    },
    templates: [
      {
        remoteId: "cloud-template",
        name: "Push",
        updatedAt: 1e3,
        lastPlaceId: null,
        exercises: [
          { slug: "bench", orderIndex: 0, sets: [{ weight: 100, reps: 5 }] },
        ],
      },
    ],
    customExercises: [],
    exerciseNotes: [],
    places: [],
    machines: [],
    placeWeights: [],
  };
}
function session(sql, id, templateId) {
  sql
    .prepare(
      "INSERT INTO local_sessions (id, template_id, template_name, status, started_at, updated_at) VALUES (?, ?, 'Push', 'completed', 1, 2)",
    )
    .run(id, templateId);
}
function queuedTemplates(sql) {
  return sql
    .prepare("SELECT * FROM local_sync_outbox WHERE entity_type = 'template'")
    .all();
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
});
describe("template synchronization with real SQLite transactions", () => {
  it("repairs a bootstrap-before-ack collision, preserves both workout links, and drains the original upload", async () => {
    const { sql, db, templateId, pending } = await fixture();
    session(sql, "phone-session", templateId);
    await applyIosBootstrap(db, bootstrap());
    session(sql, "echo-session", "cloud-template");
    await completeTemplateSync(
      db,
      pending.operationId,
      templateId,
      "cloud-template",
    );
    expect(
      sql.prepare("SELECT id, remote_id FROM local_templates").all(),
    ).toEqual([{ id: templateId, remote_id: "cloud-template" }]);
    expect(
      sql
        .prepare("SELECT template_id, remote_template_id FROM local_sessions")
        .all(),
    ).toEqual([
      { template_id: templateId, remote_template_id: "cloud-template" },
      { template_id: templateId, remote_template_id: "cloud-template" },
    ]);
    expect(queuedTemplates(sql)).toHaveLength(0);
    expect(
      sql
        .prepare(
          "SELECT * FROM local_sync_outbox WHERE entity_type = 'session'",
        )
        .all(),
    ).toHaveLength(2);
    expect((await getLocalTemplate(db, templateId))?.exercises[0].sets).toEqual(
      [{ weight: 100, reps: 5 }],
    );
    await applyIosBootstrap(db, bootstrap());
    expect(sql.prepare("SELECT id FROM local_templates").all()).toHaveLength(1);
  });
  it("also handles acknowledgment before bootstrap", async () => {
    const { sql, db, templateId, pending } = await fixture();
    await completeTemplateSync(
      db,
      pending.operationId,
      templateId,
      "cloud-template",
    );
    await applyIosBootstrap(db, bootstrap());
    expect(sql.prepare("SELECT id FROM local_templates").all()).toEqual([
      { id: templateId },
    ]);
    expect(queuedTemplates(sql)).toHaveLength(0);
  });
  it("keeps an offline edit when a subscribed cloud snapshot arrives", async () => {
    const { db, templateId, pending } = await fixture();
    await completeTemplateSync(
      db,
      pending.operationId,
      templateId,
      "cloud-template",
    );
    await saveLocalTemplate(db, {
      templateId,
      name: "New name",
      exercises: [{ slug: "bench", sets: [{ weight: 150, reps: 8 }] }],
    });
    const newer = await getPendingTemplateSync(db);
    await applyIosBootstrap(db, bootstrap());
    expect((await getLocalTemplate(db, templateId))?.name).toBe("New name");
    expect(
      (await getLocalTemplate(db, templateId))?.exercises[0].sets[0].weight,
    ).toBe(150);
    expect((await getPendingTemplateSync(db))?.operationId).toBe(
      newer?.operationId,
    );
  });
  it("does not delete a newer save when an older in-flight upload is acknowledged", async () => {
    const { db, templateId, pending } = await fixture();
    await saveLocalTemplate(db, {
      templateId,
      name: "New name",
      exercises: [{ slug: "bench", sets: [{ weight: 150, reps: 8 }] }],
    });
    const newer = await getPendingTemplateSync(db);
    await completeTemplateSync(
      db,
      pending.operationId,
      templateId,
      "cloud-template",
    );
    const queued = await getPendingTemplateSync(db);
    expect(queued?.operationId).toBe(newer.operationId);
    expect(queued?.snapshot.remoteId).toBe("cloud-template");
    expect(queued?.snapshot.name).toBe("New name");
  });
  it("preserves a newer edit on the cloud echo while merging identities", async () => {
    const { sql, db, templateId, pending } = await fixture();
    await applyIosBootstrap(db, bootstrap());
    await saveLocalTemplate(db, {
      templateId: "cloud-template",
      name: "Edited echo",
      exercises: [{ slug: "bench", sets: [{ weight: 175, reps: 8 }] }],
    });
    sql
      .prepare(
        "UPDATE local_sync_outbox SET created_at = created_at + 1000 WHERE entity_id = 'cloud-template'",
      )
      .run();
    const echo = sql
      .prepare(
        "SELECT operation_id FROM local_sync_outbox WHERE entity_id = 'cloud-template'",
      )
      .get();
    await completeTemplateSync(
      db,
      pending.operationId,
      templateId,
      "cloud-template",
    );
    const queued = await getPendingTemplateSync(db);
    expect(queued?.operationId).toBe(echo.operation_id);
    expect(queued?.templateId).toBe(templateId);
    expect(queued?.snapshot.localId).toBe(templateId);
    expect(queued?.snapshot.remoteId).toBe("cloud-template");
    expect((await getLocalTemplate(db, templateId))?.name).toBe("Edited echo");
    expect(
      (await getLocalTemplate(db, templateId))?.exercises[0].sets[0].weight,
    ).toBe(175);
    expect(queuedTemplates(sql)).toHaveLength(1);
  });
  it("rolls back link repair and acknowledgment if queueing a linked workout fails", async () => {
    const { sql, db, templateId, pending } = await fixture();
    session(sql, "phone-session", templateId);
    await applyIosBootstrap(db, bootstrap());
    const run = db.runAsync.bind(db);
    const failure = vi
      .spyOn(db, "runAsync")
      .mockImplementation(async (statement, ...values) => {
        if (
          statement.includes("INSERT INTO local_sync_outbox") &&
          statement.includes("'session'")
        ) {
          throw new Error("disk write interrupted");
        }
        return run(statement, ...values);
      });
    await expect(
      completeTemplateSync(
        db,
        pending.operationId,
        templateId,
        "cloud-template",
      ),
    ).rejects.toThrow("disk write interrupted");
    expect((await getPendingTemplateSync(db)).operationId).toBe(
      pending.operationId,
    );
    expect(
      sql
        .prepare(
          "SELECT remote_template_id FROM local_sessions WHERE id = 'phone-session'",
        )
        .get().remote_template_id,
    ).toBeNull();
    expect(sql.prepare("SELECT id FROM local_templates").all()).toHaveLength(2);
    failure.mockRestore();
    await completeTemplateSync(
      db,
      pending.operationId,
      templateId,
      "cloud-template",
    );
    expect(queuedTemplates(sql)).toHaveLength(0);
    const upload = sql
      .prepare(
        "SELECT payload_json FROM local_sync_outbox WHERE entity_type = 'session'",
      )
      .get();
    expect(JSON.parse(upload.payload_json).remoteTemplateId).toBe(
      "cloud-template",
    );
  });
  it("keeps a saved edit when bootstrap runs immediately after the save transaction commits", async () => {
    const { db, templateId, pending } = await fixture();
    await completeTemplateSync(
      db,
      pending.operationId,
      templateId,
      "cloud-template",
    );
    expect(await getPendingTemplateSync(db)).toBeNull();
    const transaction = db.withExclusiveTransactionAsync.bind(db);
    let intercept = true;
    vi.spyOn(db, "withExclusiveTransactionAsync").mockImplementation(
      async (operation) => {
        await transaction(operation);
        if (intercept) {
          intercept = false;
          await applyIosBootstrap(db, bootstrap());
        }
      },
    );
    await saveLocalTemplate(db, {
      templateId,
      name: "New local edit",
      exercises: [{ slug: "bench", sets: [{ weight: 225, reps: 8 }] }],
    });
    const saved = await getLocalTemplate(db, templateId);
    const queued = await getPendingTemplateSync(db);
    expect(saved.name).toBe("New local edit");
    expect(saved.exercises[0].sets).toEqual([{ weight: 225, reps: 8 }]);
    expect(queued.snapshot.name).toBe("New local edit");
    expect(queued.snapshot.exercises[0].sets).toEqual([
      { weight: 225, reps: 8 },
    ]);
  });

  it("lets an older acknowledgment see the newest save before reconciling an edited cloud echo", async () => {
    const { sql, db, templateId, pending } = await fixture();
    await applyIosBootstrap(db, bootstrap());
    await saveLocalTemplate(db, {
      templateId: "cloud-template",
      name: "Edited echo",
      exercises: [{ slug: "bench", sets: [{ weight: 175, reps: 8 }] }],
    });
    sql
      .prepare(
        "UPDATE local_sync_outbox SET created_at = ? WHERE entity_id = 'cloud-template'",
      )
      .run(pending.createdAt + 1000);
    vi.spyOn(Date, "now").mockReturnValue(pending.createdAt + 2000);
    const transaction = db.withExclusiveTransactionAsync.bind(db);
    let intercept = true;
    vi.spyOn(db, "withExclusiveTransactionAsync").mockImplementation(
      async (operation) => {
        await transaction(operation);
        if (intercept) {
          intercept = false;
          await completeTemplateSync(
            db,
            pending.operationId,
            templateId,
            "cloud-template",
          );
        }
      },
    );
    await saveLocalTemplate(db, {
      templateId,
      name: "Latest phone edit",
      exercises: [{ slug: "bench", sets: [{ weight: 225, reps: 8 }] }],
    });
    const saved = await getLocalTemplate(db, templateId);
    const queued = await getPendingTemplateSync(db);
    expect(saved.name).toBe("Latest phone edit");
    expect(saved.exercises[0].sets).toEqual([{ weight: 225, reps: 8 }]);
    expect(queued.operationId).not.toBe(pending.operationId);
    expect(queued.snapshot.name).toBe("Latest phone edit");
    expect(queued.snapshot.remoteId).toBe("cloud-template");
    expect(queued.snapshot.exercises[0].sets).toEqual([
      { weight: 225, reps: 8 },
    ]);
    expect(queuedTemplates(sql)).toHaveLength(1);
  });

  it("rolls back a template save when its outbox write fails, then retries successfully", async () => {
    const { sql, db, templateId, pending } = await fixture();
    await completeTemplateSync(
      db,
      pending.operationId,
      templateId,
      "cloud-template",
    );
    const before = {
      templates: sql.prepare("SELECT * FROM local_templates").all(),
      exercises: sql.prepare("SELECT * FROM local_template_exercises").all(),
      outbox: sql.prepare("SELECT * FROM local_sync_outbox").all(),
    };
    const run = db.runAsync.bind(db);
    const failure = vi
      .spyOn(db, "runAsync")
      .mockImplementation(async (statement, ...values) => {
        if (
          statement.includes("INSERT INTO local_sync_outbox") &&
          statement.includes("'template'")
        ) {
          throw new Error("outbox write interrupted");
        }
        return run(statement, ...values);
      });
    const edit = {
      templateId,
      name: "New local edit",
      exercises: [{ slug: "bench", sets: [{ weight: 225, reps: 8 }] }],
    };
    await expect(saveLocalTemplate(db, edit)).rejects.toThrow(
      "outbox write interrupted",
    );
    expect({
      templates: sql.prepare("SELECT * FROM local_templates").all(),
      exercises: sql.prepare("SELECT * FROM local_template_exercises").all(),
      outbox: sql.prepare("SELECT * FROM local_sync_outbox").all(),
    }).toEqual(before);
    failure.mockRestore();
    await saveLocalTemplate(db, edit);
    expect((await getLocalTemplate(db, templateId)).name).toBe(
      "New local edit",
    );
    expect((await getPendingTemplateSync(db)).snapshot.name).toBe(
      "New local edit",
    );
  });
});
