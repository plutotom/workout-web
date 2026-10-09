// Node-only integration tests bundle the real iOS modules with phone aliases.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseBackup, serializeBackup } from "./workout-backup";
let storage;
let bundleDirectory;
beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), "workout-note-storage-"));
  const outfile = join(bundleDirectory, "storage.mjs");
  await build({
    stdin: {
      contents:
        'export * from "./repository"; export * from "./backup"; export * from "./migrations";',
      resolveDir: resolve(import.meta.dirname, "../../mobile/src/data/local"),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    alias: {
      "@": resolve(import.meta.dirname, "../../mobile/src"),
      "@shared": import.meta.dirname,
    },
    plugins: [
      {
        name: "native-uuid-for-node",
        setup(builder) {
          builder.onResolve({ filter: /^expo-crypto$/ }, () => ({
            path: "uuid",
            namespace: "test-native",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test-native" }, () => ({
            contents: 'export { randomUUID } from "node:crypto";',
          }));
        },
      },
    ],
  });
  storage = await import(
    /* @vite-ignore */
    pathToFileURL(outfile).href
  );
});
afterAll(async () => {
  if (bundleDirectory)
    await rm(bundleDirectory, { recursive: true, force: true });
});
function sqliteFixture() {
  const sql = new DatabaseSync(":memory:");
  const adapter = {
    execAsync: async (statement) => sql.exec(statement),
    getFirstAsync: async (statement, ...params) =>
      sql.prepare(statement).get(...params) ?? null,
    getAllAsync: async (statement, ...params) =>
      sql.prepare(statement).all(...params),
    runAsync: async (statement, ...params) =>
      sql.prepare(statement).run(...params),
    withTransactionAsync: async (operation) => transaction(operation),
    withExclusiveTransactionAsync: async (operation) =>
      transaction(() => operation(db)),
  };
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
  const db = adapter;
  return { db, sql };
}
async function seedNote(db, fields = {}) {
  await db.runAsync(
    `INSERT INTO local_sessions (
       id, template_name, status, session_kind, input_mode, note_body, note_unit,
       started_at, completed_at, updated_at, external_provider, external_id,
       duration_seconds, energy_kcal
     ) VALUES ('note-1', 'Note workout', ?, ?, ?, 'original', 'lb', 100, 200, 300,
       'apple_health', 'health-uuid', 100, 42)`,
    fields.status ?? "completed",
    fields.sessionKind ?? "tracked",
    fields.inputMode ?? "note",
  );
}
describe("note storage using SQLite", () => {
  it("reconciles late remote Health metadata before a phone edit without refreshing no-op adoptions", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      const remote = {
        _id: "remote-note",
        clientId: "phone-a-note",
        clientUpdatedAt: Date.now() + 10_000,
        status: "completed",
        sessionKind: "tracked",
        inputMode: "note",
        noteBody: "original",
        noteUnit: "lb",
        templateName: "Note workout",
        startedAt: 100,
        completedAt: 200,
        countsTowardGoals: true,
        placeId: null,
        placeName: null,
        externalId: null,
        exercises: [],
      };
      let refreshes = 0;
      const refresh = () => {
        refreshes += 1;
      };
      const id = await storage.adoptRemoteNoteWorkout(db, remote, refresh);
      expect(refreshes).toBe(1);
      await storage.adoptRemoteNoteWorkout(db, remote, refresh);
      expect(refreshes).toBe(1);
      sql
        .prepare(
          "UPDATE local_sessions SET health_export_pending = 1 WHERE id = ?",
        )
        .run(id);
      const linked = {
        ...remote,
        clientUpdatedAt: remote.clientUpdatedAt + 1000,
        noteBody: "corrected on phone A",
        noteUnit: "kg",
        templateName: "Evening note",
        startedAt: 110,
        completedAt: 310,
        countsTowardGoals: false,
        placeId: "gym-remote",
        placeName: "Gym",
        placeStarred: true,
        externalProvider: "apple_health",
        externalId: "late-watch-uuid",
        activityType: "traditional_strength",
        sourceName: "Apple Watch",
        sourceBundleId: "watch.bundle",
        durationSeconds: 200,
        energyKcal: 93,
        distanceMeters: 10,
        importedAt: 400,
      };
      await storage.adoptRemoteNoteWorkout(db, linked, refresh);
      expect(refreshes).toBe(2);
      expect(
        sql
          .prepare(
            "SELECT health_export_pending FROM local_sessions WHERE id = ?",
          )
          .get(id).health_export_pending,
      ).toBe(0);
      expect(await storage.getPendingSessionSync(db)).toBeNull();
      await storage.updateLocalWorkoutNote(
        db,
        id,
        "edited on phone B",
        "completed",
      );
      expect((await storage.getPendingSessionSync(db)).snapshot).toMatchObject({
        clientId: remote.clientId,
        noteBody: "edited on phone B",
        noteUnit: "kg",
        templateName: linked.templateName,
        startedAt: 110,
        completedAt: 310,
        countsTowardGoals: false,
        placeId: linked.placeId,
        placeName: linked.placeName,
        externalProvider: linked.externalProvider,
        externalId: linked.externalId,
        activityType: linked.activityType,
        sourceName: linked.sourceName,
        sourceBundleId: linked.sourceBundleId,
        durationSeconds: 200,
        energyKcal: 93,
        distanceMeters: 10,
        importedAt: 400,
      });
      await storage.adoptRemoteNoteWorkout(
        db,
        {
          ...linked,
          clientUpdatedAt: linked.clientUpdatedAt + 10_000,
          noteBody: "remote conflict",
        },
        refresh,
      );
      expect(refreshes).toBe(2);
      expect((await storage.getLocalWorkout(db, id)).noteBody).toBe(
        "edited on phone B",
      );
    } finally {
      sql.close();
    }
  });
  it("persists phone Health export intent with completion and retries a failed atomic Health attachment", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      await storage.setHealthExportEnabled(db, true);
      const id = await storage.startLocalNoteWorkout(db);
      // A future restored/client revision must not be regressed by Health follow-up.
      sql
        .prepare("UPDATE local_sessions SET updated_at = ? WHERE id = ?")
        .run(Date.now() + 60_000, id);
      await storage.finishLocalNoteWorkout(
        db,
        id,
        "last typed before interruption",
      );
      const completed = await storage.getLocalWorkout(db, id);
      // No provider or Watch follow-up ran: the coordinator can recover on reopen.
      expect(await storage.listPendingHealthExports(db)).toMatchObject([
        { sessionId: id },
      ]);
      expect((await storage.getPendingSessionSync(db)).snapshot).toMatchObject({
        status: "completed",
        noteBody: completed.noteBody,
      });
      sql.exec(
        "CREATE TRIGGER reject_outbox BEFORE INSERT ON local_sync_outbox BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END;",
      );
      await expect(
        storage.attachExportedHealthUuid(db, id, "phone-uuid"),
      ).rejects.toThrow("outbox unavailable");
      expect(await storage.getLocalWorkout(db, id)).toMatchObject({
        status: "completed",
        noteBody: completed.noteBody,
        updatedAt: completed.updatedAt,
        health: null,
      });
      expect(await storage.listPendingHealthExports(db)).toHaveLength(1);
      sql.exec("DROP TRIGGER reject_outbox");
      await storage.attachExportedHealthUuid(db, id, "phone-uuid");
      expect((await storage.getLocalWorkout(db, id)).updatedAt).toBeGreaterThan(
        completed.updatedAt,
      );
      expect(
        (await storage.getPendingSessionSync(db)).snapshot.externalId,
      ).toBe("phone-uuid");
      expect(await storage.listPendingHealthExports(db)).toEqual([]);
    } finally {
      sql.close();
    }
  });

  it("never exports a second phone workout for Watch recording and recovers a stored Watch UUID after a failure", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      await storage.setHealthExportEnabled(db, true);
      const id = await storage.startLocalNoteWorkout(db);
      await storage.markWatchRecorded(db, id);
      await storage.finishLocalNoteWorkout(db, id, "Watch note");
      expect(await storage.listPendingHealthExports(db)).toEqual([]);
      await storage.saveWatchHealthUuid(db, id, "watch-uuid");
      sql.exec(
        "CREATE TRIGGER reject_outbox BEFORE INSERT ON local_sync_outbox BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END;",
      );
      expect(await storage.recoverStoredWatchHealthUuids(db)).toBe(false);
      expect(
        sql
          .prepare("SELECT value FROM local_health_state WHERE key = ?")
          .get(`watch_health_uuid:${id}`).value,
      ).toBe("watch-uuid");
      expect((await storage.getLocalWorkout(db, id)).health).toBeNull();
      sql.exec("DROP TRIGGER reject_outbox");
      // Watch attachment remains available even if phone export has since been disabled.
      await storage.setHealthExportEnabled(db, false);
      expect(await storage.recoverStoredWatchHealthUuids(db)).toBe(true);
      expect((await storage.getLocalWorkout(db, id)).health.externalId).toBe(
        "watch-uuid",
      );
      expect(
        sql
          .prepare("SELECT value FROM local_health_state WHERE key = ?")
          .get(`watch_health_uuid:${id}`),
      ).toBeUndefined();
      expect((await storage.getPendingSessionSync(db)).snapshot).toMatchObject({
        externalId: "watch-uuid",
        noteBody: "Watch note",
        exercises: [],
      });
      expect(await storage.recoverStoredWatchHealthUuids(db)).toBe(false);
      expect(await storage.listPendingHealthExports(db)).toEqual([]);
    } finally {
      sql.close();
    }
  });
  it("starts a note with captured units, rejects an existing workout, and atomically finishes the latest text", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      sql.exec("UPDATE local_preferences SET unit = 'kg'");
      const id = await storage.startLocalNoteWorkout(db);
      expect(await storage.getLocalWorkout(db, id)).toMatchObject({
        status: "in_progress",
        templateName: "Note workout",
        inputMode: "note",
        noteBody: "",
        noteUnit: "kg",
        exercises: [],
      });
      await expect(storage.startLocalNoteWorkout(db)).rejects.toThrow(
        "ACTIVE_SESSION_EXISTS",
      );
      expect(await storage.listLocalCompletedSessions(db)).toEqual([]);
      await storage.updateLocalWorkoutNote(
        db,
        id,
        "earlier text",
        "in_progress",
      );
      await storage.finishLocalNoteWorkout(db, id, "  Pull up, 10, 9, 9\n");
      const completed = await storage.getLocalWorkout(db, id);
      expect(completed).toMatchObject({
        status: "completed",
        noteBody: "  Pull up, 10, 9, 9\n",
        noteUnit: "kg",
        exercises: [],
      });
      expect((await storage.getPendingSessionSync(db)).snapshot).toMatchObject({
        status: "completed",
        noteBody: completed.noteBody,
        completedAt: completed.completedAt,
        exercises: [],
      });
      await expect(
        storage.updateLocalWorkoutNote(db, id, "stale typing", "in_progress"),
      ).rejects.toThrow("Workout state changed");
      await expect(
        storage.finishLocalNoteWorkout(db, id, "duplicate finish"),
      ).rejects.toThrow("Only active note workouts");
      expect(await storage.listLocalCompletedSessions(db)).toMatchObject([
        {
          sessionId: id,
          inputMode: "note",
          noteBody: completed.noteBody,
          noteUnit: "kg",
          exercises: [],
        },
      ]);
      const updatedAt = completed.updatedAt;
      await storage.updateLocalWorkoutNote(
        db,
        id,
        "corrected text",
        "completed",
      );
      expect((await storage.getLocalWorkout(db, id)).completedAt).toBe(
        completed.completedAt,
      );
      expect((await storage.getLocalWorkout(db, id)).updatedAt).toBeGreaterThan(
        updatedAt,
      );
      expect(await storage.listLocalCompletedSessions(db)).toHaveLength(1);
    } finally {
      sql.close();
    }
  });

  it("rolls back finish and latest text together if snapshot queueing fails", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      await storage.setHealthExportEnabled(db, true);
      const id = await storage.startLocalNoteWorkout(db);
      await storage.updateLocalWorkoutNote(
        db,
        id,
        "saved before finish",
        "in_progress",
      );
      await expect(
        storage.finishLocalNoteWorkout(db, id, "\n \t"),
      ).rejects.toThrow("cannot be blank");
      sql.exec(
        "CREATE TRIGGER reject_outbox BEFORE INSERT ON local_sync_outbox BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END;",
      );
      await expect(
        storage.finishLocalNoteWorkout(db, id, "last typed text"),
      ).rejects.toThrow("outbox unavailable");
      expect(await storage.getLocalWorkout(db, id)).toMatchObject({
        status: "in_progress",
        noteBody: "saved before finish",
      });
      expect(
        (await storage.getLocalWorkout(db, id)).completedAt,
      ).toBeUndefined();
      expect(
        sql
          .prepare(
            "SELECT health_export_pending FROM local_sessions WHERE id = ?",
          )
          .get(id).health_export_pending,
      ).toBe(0);
    } finally {
      sql.close();
    }
  });

  it("adopts remote completed notes without duplicate sync/export and preserves newer local text on repeated adoption", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      const remote = {
        _id: "remote-note",
        clientId: "original-device-id",
        clientUpdatedAt: Date.now() + 10_000,
        status: "completed",
        sessionKind: "tracked",
        inputMode: "note",
        noteBody: "original",
        noteUnit: "kg",
        templateName: "Note workout",
        startedAt: 100,
        completedAt: 200,
        countsTowardGoals: true,
        placeId: "remote-place",
        placeName: "Gym",
        placeStarred: true,
        externalProvider: "apple_health",
        externalId: "watch-uuid",
        activityType: "traditional_strength",
        sourceName: "Apple Watch",
        sourceBundleId: "com.apple.health",
        energyKcal: 42,
        durationSeconds: 100,
        distanceMeters: null,
        importedAt: 250,
        exercises: [],
      };
      const id = await storage.adoptRemoteNoteWorkout(db, remote);
      expect(id).toBe(remote.clientId);
      expect(await storage.getPendingSessionSync(db)).toBeNull();
      expect(await storage.countPendingHealthExports(db)).toBe(0);
      expect(await storage.getLocalWorkout(db, id)).toMatchObject({
        remoteId: remote._id,
        noteBody: "original",
        noteUnit: "kg",
        completedAt: 200,
        startedAt: 100,
        health: { externalId: "watch-uuid", energyKcal: 42 },
      });
      await storage.updateLocalWorkoutNote(
        db,
        id,
        "edited locally",
        "completed",
      );
      await storage.adoptRemoteNoteWorkout(db, remote);
      expect((await storage.getLocalWorkout(db, id)).noteBody).toBe(
        "edited locally",
      );
      expect((await storage.getLocalWorkout(db, remote._id)).noteBody).toBe(
        "edited locally",
      );
      const snapshot = (await storage.getPendingSessionSync(db)).snapshot;
      expect(snapshot).toMatchObject({
        clientId: remote.clientId,
        externalId: remote.externalId,
        noteBody: "edited locally",
        noteUnit: "kg",
        completedAt: 200,
        placeId: remote.placeId,
        placeName: "Gym",
      });
      expect(snapshot.updatedAt).toBeGreaterThan(remote.clientUpdatedAt);
      expect(await storage.listLocalCompletedSessions(db)).toHaveLength(1);
      // Once sync has drained, a newer remote edit can reconcile without queueing.
      sql
        .prepare(
          "DELETE FROM local_sync_outbox WHERE entity_type = 'session' AND entity_id = ?",
        )
        .run(id);
      const newerRemote = {
        ...remote,
        noteBody: "newer remote correction",
        clientUpdatedAt: snapshot.updatedAt + 1000,
      };
      await storage.adoptRemoteNoteWorkout(db, newerRemote);
      expect(await storage.getLocalWorkout(db, id)).toMatchObject({
        noteBody: newerRemote.noteBody,
        updatedAt: newerRemote.clientUpdatedAt,
      });
      expect(await storage.getPendingSessionSync(db)).toBeNull();
      await storage.updateLocalWorkoutNote(
        db,
        id,
        "pending offline correction",
        "completed",
      );
      await storage.adoptRemoteNoteWorkout(db, {
        ...newerRemote,
        noteBody: "conflicting remote correction",
        clientUpdatedAt: newerRemote.clientUpdatedAt + 10_000,
      });
      expect((await storage.getLocalWorkout(db, id)).noteBody).toBe(
        "pending offline correction",
      );
      await expect(
        storage.adoptRemoteNoteWorkout(db, { ...remote, clientId: null }),
      ).rejects.toThrow("Only completed unparsed");
    } finally {
      sql.close();
    }
  });
  it("migrates an existing version 7 session without changing its data", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      await seedNote(db);
      sql.exec(
        "ALTER TABLE local_sessions DROP COLUMN input_mode; ALTER TABLE local_sessions DROP COLUMN note_body; ALTER TABLE local_sessions DROP COLUMN note_unit; PRAGMA user_version = 7;",
      );
      await storage.migrateLocalDatabase(db);
      expect(sql.prepare("PRAGMA user_version").get()?.user_version).toBe(8);
      const workout = await storage.getLocalWorkout(db, "note-1");
      expect(workout).toMatchObject({
        inputMode: "list",
        noteBody: null,
        noteUnit: null,
        startedAt: 100,
        completedAt: 200,
        updatedAt: 300,
      });
      expect(workout?.health).toMatchObject({
        externalId: "health-uuid",
        energyKcal: 42,
      });
      await storage.migrateLocalDatabase(db);
    } finally {
      sql.close();
    }
  });
  it("edits a finished note and commits its exact snapshot without changing timing or Health", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      await seedNote(db);
      const original = await storage.getLocalWorkout(db, "note-1");
      const text = "  Bench 10@150\n\nPull up, 10, 9, 9\n	";
      await storage.updateLocalWorkoutNote(db, "note-1", text);
      const updated = await storage.getLocalWorkout(db, "note-1");
      expect(updated).toEqual({
        ...original,
        noteBody: text,
        updatedAt: expect.any(Number),
      });
      expect(updated.updatedAt).toBeGreaterThan(original.updatedAt);
      const pending = await storage.getPendingSessionSync(db);
      expect(pending).not.toBeNull();
      expect(pending.snapshot).toMatchObject({
        inputMode: "note",
        noteBody: text,
        noteUnit: "lb",
        status: "completed",
        completedAt: 200,
        externalId: "health-uuid",
        exercises: [],
      });
      await storage.updateLocalWorkoutNote(db, "note-1", "corrected");
      expect(
        sql
          .prepare(
            "SELECT COUNT(*) AS count FROM local_sync_outbox WHERE entity_type = 'session'",
          )
          .get()?.count,
      ).toBe(1);
      expect(
        (await storage.getPendingSessionSync(db)).snapshot.updatedAt,
      ).toBeGreaterThan(updated.updatedAt);
    } finally {
      sql.close();
    }
  });
  it("rolls back the note if snapshot queueing fails", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      await seedNote(db);
      sql.exec(
        "CREATE TRIGGER reject_outbox BEFORE INSERT ON local_sync_outbox BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END;",
      );
      await expect(
        storage.updateLocalWorkoutNote(db, "note-1", "changed"),
      ).rejects.toThrow("outbox unavailable");
      expect((await storage.getLocalWorkout(db, "note-1"))?.noteBody).toBe(
        "original",
      );
      expect((await storage.getLocalWorkout(db, "note-1"))?.updatedAt).toBe(
        300,
      );
    } finally {
      sql.close();
    }
  });
  it.each([
    ["list", { inputMode: "list" }],
    ["abandoned", { status: "abandoned" }],
    ["Health summary", { sessionKind: "health_summary" }],
  ])("rejects edits to a %s session", async (_label, fields) => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      await seedNote(db, fields);
      await expect(
        storage.updateLocalWorkoutNote(db, "note-1", "changed"),
      ).rejects.toThrow("Only active or completed note workouts");
    } finally {
      sql.close();
    }
  });
  it("allows active blank notes, rejects completed blanks and overflow without truncation", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      await seedNote(db, { status: "in_progress" });
      await storage.updateLocalWorkoutNote(db, "note-1", " \n	");
      expect((await storage.getLocalWorkout(db, "note-1"))?.noteBody).toBe(
        " \n	",
      );
      await storage.updateLocalWorkoutNote(db, "note-1", "n".repeat(2e4));
      await expect(
        storage.updateLocalWorkoutNote(db, "note-1", "n".repeat(20001)),
      ).rejects.toThrow("20000 characters");
      expect(
        (await storage.getLocalWorkout(db, "note-1"))?.noteBody,
      ).toHaveLength(2e4);
      sql.exec("UPDATE local_sessions SET status = 'completed'");
      await expect(
        storage.updateLocalWorkoutNote(db, "note-1", "\n	 "),
      ).rejects.toThrow("cannot be blank");
    } finally {
      sql.close();
    }
  });
  it("restores an original iOS backup with list defaults", async () => {
    const { db, sql } = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(db);
      const parsed = parseBackup(
        await readFile(
          join(
            import.meta.dirname,
            "fixtures/import-compat/ios-backup-v1-original.json",
          ),
          "utf8",
        ),
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(parsed.error);
      const result = await storage.restoreLocalBackup(db, parsed.snapshot);
      expect(result.sessionsAdded).toBe(1);
      const restored = await storage.getLocalWorkout(
        db,
        parsed.snapshot.sessions[0].id,
      );
      expect(restored).toMatchObject({
        inputMode: "list",
        noteBody: null,
        noteUnit: null,
      });
      expect(restored.exercises.length).toBeGreaterThan(0);
    } finally {
      sql.close();
    }
  });

  it("backs up and restores note data and queues a local-only restored session", async () => {
    const source = sqliteFixture();
    const target = sqliteFixture();
    try {
      await storage.migrateLocalDatabase(source.db);
      await storage.migrateLocalDatabase(target.db);
      await seedNote(source.db);
      await storage.updateLocalWorkoutNote(
        source.db,
        "note-1",
        "  Bent over row\n- 180 6\n",
      );
      const backup = await storage.createLocalBackup(source.db);
      const parsed = parseBackup(serializeBackup(backup));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(parsed.error);
      expect(
        await storage.restoreLocalBackup(target.db, parsed.snapshot),
      ).toMatchObject({ sessionsAdded: 1 });
      expect(await storage.getLocalWorkout(target.db, "note-1")).toEqual(
        await storage.getLocalWorkout(source.db, "note-1"),
      );
      expect(
        (await storage.getPendingSessionSync(target.db)).snapshot,
      ).toMatchObject({
        inputMode: "note",
        noteBody: "  Bent over row\n- 180 6\n",
        noteUnit: "lb",
        exercises: [],
      });
      expect(
        await storage.restoreLocalBackup(target.db, parsed.snapshot),
      ).toMatchObject({ sessionsAdded: 0, skipped: 1 });
    } finally {
      source.sql.close();
      target.sql.close();
    }
  });
});
