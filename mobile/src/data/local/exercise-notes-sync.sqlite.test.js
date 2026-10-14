import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
vi.mock("../../../../backend/lib/auth", () => ({
  requireUser: async () => ({ _id: "user-1", unit: "lb" }),
  getUser: async () => ({ _id: "user-1", unit: "lb" }),
}));
import { get as getBootstrap } from "../../../../backend/routes/ios/bootstrap";
import { pushExerciseNote } from "../../../../backend/routes/ios/sync";
import { migrateLocalDatabase } from "./migrations";
import {
  applyIosBootstrap,
  completeExerciseNoteSync,
  getLocalExerciseNotes,
  getPendingExerciseNoteSync,
  importLocalBundle,
  quarantineExerciseNoteSync,
  saveLocalExerciseNote,
} from "./repository";

const databases = [];
async function fixture() {
  const sql = new DatabaseSync(":memory:");
  databases.push(sql);
  const binds = (values) =>
    values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
  const db = {
    execAsync: async (s) => sql.exec(s),
    runAsync: async (s, ...v) => sql.prepare(s).run(...binds(v)),
    getFirstAsync: async (s, ...v) => sql.prepare(s).get(...binds(v)) ?? null,
    getAllAsync: async (s, ...v) => sql.prepare(s).all(...binds(v)),
    withTransactionAsync: async (op) => transaction(op),
    withExclusiveTransactionAsync: async (op) => transaction(() => op(db)),
  };
  async function transaction(op) {
    sql.exec("BEGIN");
    try {
      await op();
      sql.exec("COMMIT");
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  }
  await migrateLocalDatabase(db);
  const notes = new Map();
  const receipts = new Map();
  const ctx = {
    db: {
      query(table) {
        const filters = {};
        return {
          withIndex(_index, select) {
            const q = {
              eq(key, value) {
                filters[key] = value;
                return q;
              },
            };
            select(q);
            return this;
          },
          order() {
            return this;
          },
          async take() {
            return table === "exerciseNotes" ? [...notes.values()] : [];
          },
          async unique() {
            return notes.get(filters.exerciseSlug) ?? null;
          },
          async first() {
            return receipts.get(filters.operationId) ?? null;
          },
        };
      },
      async insert(table, row) {
        const id = randomUUID();
        if (table === "exerciseNotes")
          notes.set(row.exerciseSlug, { ...row, _id: id });
        else receipts.set(row.operationId, { ...row, _id: id });
        return id;
      },
      async patch(id, patch) {
        Object.assign(
          [...notes.values()].find((row) => row._id === id),
          patch,
        );
      },
      async delete(id) {
        const row = [...notes.values()].find((row) => row._id === id);
        if (row) notes.delete(row.exerciseSlug);
      },
    },
  };
  const upload = (pending) =>
    pushExerciseNote._handler(ctx, {
      operationId: pending.operationId,
      deviceId: "phone-1",
      note: pending.snapshot,
    });
  const bootstrap = async () =>
    applyIosBootstrap(db, await getBootstrap._handler(ctx, {}));
  const localNote = async (slug) =>
    (await getLocalExerciseNotes(db, [slug]))[slug];
  return { db, sql, notes, receipts, upload, bootstrap, localNote };
}

function bundle(notes) {
  return {
    format: "workout.export",
    version: 1,
    exportedAt: 1,
    unit: "lb",
    customExercises: [],
    templates: [
      {
        name: "Push",
        exercises: [
          {
            slug: "bench-press",
            name: "Bench press",
            notes,
            sets: [{ weight: 100, reps: 5 }],
          },
        ],
      },
    ],
  };
}
afterEach(() => {
  for (const sql of databases.splice(0)) sql.close();
});

describe("exercise notes through offline storage, mutation and bootstrap", () => {
  it.each([600, 10_000])(
    "preserves the entire %s-character note across sync and retry",
    async (length) => {
      const h = await fixture();
      const note = "x".repeat(length - 6) + "\nTAIL!";
      await saveLocalExerciseNote(h.db, "bench-press", note);
      const pending = await getPendingExerciseNoteSync(h.db);
      await h.bootstrap();
      expect(await h.localNote("bench-press")).toBe(note);
      await h.upload(pending);
      await h.upload(pending);
      await completeExerciseNoteSync(h.db, pending.operationId);
      await h.bootstrap();
      expect(h.notes.get("bench-press").notes).toBe(note);
      expect(await h.localNote("bench-press")).toBe(note);
      expect(h.receipts.size).toBe(1);
    },
  );

  it("rejects overflow without losing the saved text or its pending upload", async () => {
    const h = await fixture();
    const note = "x".repeat(10_000);
    await saveLocalExerciseNote(h.db, "bench-press", note);
    const pending = await getPendingExerciseNoteSync(h.db);
    await expect(
      saveLocalExerciseNote(h.db, "bench-press", note + "x"),
    ).rejects.toThrow("10000 characters");
    expect(await h.localNote("bench-press")).toBe(note);
    expect(await getPendingExerciseNoteSync(h.db)).toEqual(pending);
    await expect(
      h.upload({
        ...pending,
        snapshot: { ...pending.snapshot, notes: note + "x" },
      }),
    ).rejects.toThrow("10000 characters");
    expect(h.notes.size).toBe(0);
    expect(h.receipts.size).toBe(0);
  });

  it("preserves and quarantines a legacy oversized note, then syncs its shortened edit", async () => {
    const h = await fixture();
    const old = "x".repeat(12_000);
    h.sql
      .prepare(
        "INSERT INTO local_exercise_notes (slug, notes, updated_at) VALUES ('bench-press', ?, 1)",
      )
      .run(old);
    h.sql
      .prepare(
        "INSERT INTO local_sync_outbox (entity_type, entity_id, operation_id, payload_json, created_at) VALUES ('exercise_note', 'bench-press', 'legacy', ?, 1)",
      )
      .run(JSON.stringify({ slug: "bench-press", notes: old }));
    h.notes.set("bench-press", {
      _id: "cloud-note",
      userId: "user-1",
      exerciseSlug: "bench-press",
      notes: old.slice(0, 500),
    });
    await quarantineExerciseNoteSync(h.db, "legacy");
    await h.bootstrap();
    expect(await h.localNote("bench-press")).toBe(old);
    expect(await getPendingExerciseNoteSync(h.db)).toBeNull();
    expect(
      h.sql
        .prepare(
          "SELECT payload_json FROM local_sync_outbox WHERE entity_type = 'exercise_note_rejected'",
        )
        .get(),
    ).toBeDefined();
    const next = old.slice(0, 10_000);
    await saveLocalExerciseNote(h.db, "bench-press", next);
    expect(
      h.sql
        .prepare(
          "SELECT * FROM local_sync_outbox WHERE entity_type = 'exercise_note_rejected'",
        )
        .all(),
    ).toHaveLength(0);
    const pending = await getPendingExerciseNoteSync(h.db);
    await h.upload(pending);
    await completeExerciseNoteSync(h.db, pending.operationId);
    await h.bootstrap();
    expect(await h.localNote("bench-press")).toBe(next);
    expect(h.notes.get("bench-press").notes).toBe(next);
  });

  it("keeps oversized legacy notes even without a pending upload", async () => {
    const h = await fixture();
    const old = "x".repeat(12_000);
    h.sql
      .prepare(
        "INSERT INTO local_exercise_notes (slug, notes, updated_at) VALUES ('bench-press', ?, 1)",
      )
      .run(old);
    h.notes.set("bench-press", {
      _id: "cloud-note",
      userId: "user-1",
      exerciseSlug: "bench-press",
      notes: "short cloud cue",
    });
    await h.bootstrap();
    expect(await h.localNote("bench-press")).toBe(old);
  });

  it("recovers the tail of a local note previously truncated by the server", async () => {
    const h = await fixture();
    const old = "x".repeat(600);
    h.sql
      .prepare(
        "INSERT INTO local_exercise_notes (slug, notes, updated_at) VALUES ('bench-press', ?, 1)",
      )
      .run(old);
    h.notes.set("bench-press", {
      _id: "cloud-note",
      userId: "user-1",
      exerciseSlug: "bench-press",
      notes: old.slice(0, 500),
    });
    await h.bootstrap();
    expect(await h.localNote("bench-press")).toBe(old);
    const pending = await getPendingExerciseNoteSync(h.db);
    expect(pending.snapshot.notes).toBe(old);
    await h.upload(pending);
    await completeExerciseNoteSync(h.db, pending.operationId);
    await h.bootstrap();
    expect(h.notes.get("bench-press").notes).toBe(old);
  });

  it("imports a 10,000-character note and rejects overflow before creating templates", async () => {
    const h = await fixture();
    const note = "x".repeat(10_000);
    await expect(importLocalBundle(h.db, bundle(note + "x"))).rejects.toThrow(
      "10000 characters",
    );
    expect(h.sql.prepare("SELECT * FROM local_templates").all()).toHaveLength(
      0,
    );
    expect(await importLocalBundle(h.db, bundle(note))).toMatchObject({
      notesImported: 1,
    });
    expect(await h.localNote("bench-press")).toBe(note);
    expect((await getPendingExerciseNoteSync(h.db)).snapshot.notes).toBe(note);
  });
});
