import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ user: null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
vi.mock("../../../../backend/lib/auth", () => ({
  requireUser: async () => server.user,
  getUser: async () => server.user,
}));

import { get as getBootstrap } from "../../../../backend/routes/ios/bootstrap";
import { pushPreferences } from "../../../../backend/routes/ios/sync";
import { migrateLocalDatabase } from "./migrations";
import { GENERAL_PREFS_ECHO_PENDING_KEY } from "./preferences";
import {
  applyIosBootstrap,
  completePreferencesSync,
  getHealthAutoImportPrefs,
  getHealthExportEnabled,
  getLocalPreferences,
  getPendingPreferencesSync,
  patchLocalPreferences,
  setHealthAutoImportPrefs,
  setHealthExportEnabled,
  setLocalNotificationPreferences,
  setLocalWatchPreferences,
} from "./repository";

const databases = new Set();
const directories = [];
const defaults = {
  unit: "lb",
  barWeightLb: 45,
  barWeightKg: 20,
  activeWorkoutMode: "focus",
  restTimerEnabled: true,
};

async function openDatabase(path = ":memory:") {
  const sql = new DatabaseSync(path);
  databases.add(sql);
  sql.exec("PRAGMA foreign_keys = ON");
  const binds = (values) =>
    values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
  const db = {
    execAsync: async (statement) => sql.exec(statement),
    runAsync: async (statement, ...values) =>
      sql.prepare(statement).run(...binds(values)),
    getFirstAsync: async (statement, ...values) =>
      sql.prepare(statement).get(...binds(values)) ?? null,
    getAllAsync: async (statement, ...values) =>
      sql.prepare(statement).all(...binds(values)),
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
  await migrateLocalDatabase(db);
  return { db, sql };
}

function cloudFixture() {
  const user = { _id: "user-1", ...defaults };
  server.user = user;
  const receipts = new Map();
  const ctx = {
    db: {
      query() {
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
          async first() {
            return receipts.get(filters.operationId) ?? null;
          },
          order() {
            return this;
          },
          async take() {
            return [];
          },
        };
      },
      async patch(_id, patch) {
        Object.assign(user, patch);
      },
      async insert(_table, receipt) {
        receipts.set(receipt.operationId, receipt);
        return receipt.operationId;
      },
    },
  };
  return {
    user,
    upload: (pending) =>
      pushPreferences._handler(ctx, {
        operationId: pending.operationId,
        deviceId: "phone-1",
        preferences: pending.snapshot,
      }),
    bootstrap: () => getBootstrap._handler(ctx, {}),
  };
}

function pendingGuard(sql) {
  return sql
    .prepare("SELECT value FROM local_metadata WHERE key = ?")
    .get(GENERAL_PREFS_ECHO_PENDING_KEY);
}

async function sync(db, cloud) {
  const pending = await getPendingPreferencesSync(db);
  if (pending) {
    await cloud.upload(pending);
    await completePreferencesSync(db, pending.operationId);
  }
  await applyIosBootstrap(db, await cloud.bootstrap());
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const sql of databases) sql.close();
  databases.clear();
  for (const path of directories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("offline settings with real SQLite and the sync mutation", () => {
  it("keeps offline edits local and uploads only edited fields", async () => {
    const { db, sql } = await openDatabase();
    const cloud = cloudFixture();
    await applyIosBootstrap(db, await cloud.bootstrap());
    await patchLocalPreferences(db, { activeWorkoutMode: "list" });
    cloud.user.unit = "kg";
    await applyIosBootstrap(db, await cloud.bootstrap());

    expect(await getLocalPreferences(db)).toMatchObject({
      unit: "kg",
      activeWorkoutMode: "list",
    });
    expect((await getPendingPreferencesSync(db)).snapshot).toEqual({
      activeWorkoutMode: "list",
    });
    await sync(db, cloud);
    expect(cloud.user).toMatchObject({ unit: "kg", activeWorkoutMode: "list" });
    expect(pendingGuard(sql)).toBeUndefined();
  });

  it("preserves a quick toggle back across stale bootstrap and an older acknowledgment", async () => {
    const { db, sql } = await openDatabase();
    const cloud = cloudFixture();
    await applyIosBootstrap(db, await cloud.bootstrap());
    await patchLocalPreferences(db, { activeWorkoutMode: "list" });
    const first = await getPendingPreferencesSync(db);
    await patchLocalPreferences(db, { activeWorkoutMode: "focus" });
    await applyIosBootstrap(db, await cloud.bootstrap());
    expect(pendingGuard(sql)).toBeDefined();

    await cloud.upload(first);
    await completePreferencesSync(db, first.operationId);
    await applyIosBootstrap(db, await cloud.bootstrap());
    expect((await getLocalPreferences(db)).activeWorkoutMode).toBe("focus");
    expect((await getPendingPreferencesSync(db)).operationId).not.toBe(
      first.operationId,
    );
    await sync(db, cloud);
    expect(cloud.user.activeWorkoutMode).toBe("focus");
    expect(pendingGuard(sql)).toBeUndefined();
  });

  it("does not undo newer cloud settings when a lost acknowledgment is retried", async () => {
    const { db } = await openDatabase();
    const cloud = cloudFixture();
    await patchLocalPreferences(db, { unit: "lb" });
    const pending = await getPendingPreferencesSync(db);
    await cloud.upload(pending);
    cloud.user.unit = "kg";
    await sync(db, cloud);
    expect(cloud.user.unit).toBe("kg");
    expect((await getLocalPreferences(db)).unit).toBe("kg");
  });

  it("releases protection after an upload even when its exact value echo was missed", async () => {
    const { db, sql } = await openDatabase();
    const cloud = cloudFixture();
    await applyIosBootstrap(db, await cloud.bootstrap());
    await patchLocalPreferences(db, { activeWorkoutMode: "list" });
    const pending = await getPendingPreferencesSync(db);
    await cloud.upload(pending);
    await completePreferencesSync(db, pending.operationId);
    cloud.user.activeWorkoutMode = "focus";
    await applyIosBootstrap(db, await cloud.bootstrap());
    expect((await getLocalPreferences(db)).activeWorkoutMode).toBe("focus");
    expect(pendingGuard(sql)).toBeUndefined();
  });

  it("serializes rapid edits and a reconnect without dropping any edited field", async () => {
    const { db } = await openDatabase();
    const cloud = cloudFixture();
    await Promise.all([
      patchLocalPreferences(db, { unit: "kg" }),
      patchLocalPreferences(db, { barWeightKg: 15 }),
      applyIosBootstrap(db, await cloud.bootstrap()),
      patchLocalPreferences(db, { activeWorkoutMode: "list" }),
      patchLocalPreferences(db, { restTimerEnabled: false }),
    ]);
    const expected = {
      unit: "kg",
      barWeightKg: 15,
      activeWorkoutMode: "list",
      restTimerEnabled: false,
    };
    expect(await getLocalPreferences(db)).toMatchObject(expected);
    expect((await getPendingPreferencesSync(db)).snapshot).toEqual(expected);
    await sync(db, cloud);
    expect(cloud.user).toMatchObject(expected);
  });

  it("rolls back the setting if its upload cannot be queued, then permits a retry", async () => {
    const { db, sql } = await openDatabase();
    const original = await getLocalPreferences(db);
    const run = db.runAsync;
    db.runAsync = async (statement, ...values) => {
      if (statement.includes("INSERT INTO local_sync_outbox"))
        throw new Error("disk full");
      return run(statement, ...values);
    };
    await expect(patchLocalPreferences(db, { unit: "kg" })).rejects.toThrow(
      "disk full",
    );
    expect(await getLocalPreferences(db)).toEqual(original);
    expect(await getPendingPreferencesSync(db)).toBeNull();
    expect(pendingGuard(sql)).toBeUndefined();
    db.runAsync = run;
    await patchLocalPreferences(db, { unit: "kg" });
    expect((await getLocalPreferences(db)).unit).toBe("kg");
  });

  it("keeps saved preferences and their pending upload when reopened offline", async () => {
    const path = mkdtempSync(join(tmpdir(), "workout-prefs-"));
    directories.push(path);
    const file = join(path, "workout.db");
    const first = await openDatabase(file);
    await patchLocalPreferences(first.db, { unit: "kg", barWeightKg: 15 });
    const pending = await getPendingPreferencesSync(first.db);
    first.sql.close();
    databases.delete(first.sql);
    const reopened = await openDatabase(file);
    expect(await getLocalPreferences(reopened.db)).toMatchObject({
      unit: "kg",
      barWeightKg: 15,
    });
    expect(await getPendingPreferencesSync(reopened.db)).toEqual(pending);
    const cloud = cloudFixture();
    await sync(reopened.db, cloud);
    expect(cloud.user).toMatchObject({ unit: "kg", barWeightKg: 15 });
  });

  it("upgrades a legacy full snapshot to the fields actually edited", async () => {
    const { db, sql } = await openDatabase();
    const cloud = cloudFixture();
    sql
      .prepare(
        "INSERT INTO local_sync_outbox (entity_type, entity_id, operation_id, payload_json, created_at) VALUES ('preferences', '1', 'legacy', ?, 1)",
      )
      .run(JSON.stringify({ ...defaults, activeWorkoutMode: "list" }));
    sql
      .prepare("INSERT INTO local_metadata (key, value) VALUES (?, ?)")
      .run(GENERAL_PREFS_ECHO_PENDING_KEY, '{"activeWorkoutMode":"list"}');
    sql.exec("UPDATE local_preferences SET active_workout_mode = 'list'");
    cloud.user.unit = "kg";
    expect((await getPendingPreferencesSync(db)).snapshot).toEqual({
      activeWorkoutMode: "list",
    });
    await sync(db, cloud);
    expect(cloud.user).toMatchObject({ unit: "kg", activeWorkoutMode: "list" });
    expect(pendingGuard(sql)).toBeUndefined();
  });

  it("retires a legacy guard when there is no remaining upload", async () => {
    const { db, sql } = await openDatabase();
    sql
      .prepare("INSERT INTO local_metadata (key, value) VALUES (?, ?)")
      .run(GENERAL_PREFS_ECHO_PENDING_KEY, '{"activeWorkoutMode":"list"}');
    const cloud = cloudFixture();
    await applyIosBootstrap(db, await cloud.bootstrap());
    expect((await getLocalPreferences(db)).activeWorkoutMode).toBe("focus");
    expect(pendingGuard(sql)).toBeUndefined();
  });

  it("keeps notifications and Apple Health settings device-local through cloud sync", async () => {
    const { db } = await openDatabase();
    await setLocalNotificationPreferences(db, {
      restTimerNotificationsEnabled: false,
      appleHealthImportNotificationsEnabled: true,
    });
    await setLocalWatchPreferences(db, { autoStartWatchWorkout: false });
    await setHealthExportEnabled(db, true);
    const health = { enabled: true, importAllTypes: false, types: ["running"] };
    await setHealthAutoImportPrefs(db, health);
    await patchLocalPreferences(db, { unit: "kg" });
    await sync(db, cloudFixture());
    expect(await getLocalPreferences(db)).toMatchObject({
      restTimerNotificationsEnabled: false,
      appleHealthImportNotificationsEnabled: true,
      autoStartWatchWorkout: false,
    });
    expect(await getHealthExportEnabled(db)).toBe(true);
    expect(await getHealthAutoImportPrefs(db)).toEqual(health);
  });

  it("defaults Watch auto-start on and keeps a local off toggle through bootstrap", async () => {
    const { db } = await openDatabase();
    expect((await getLocalPreferences(db)).autoStartWatchWorkout).toBe(true);
    await setLocalWatchPreferences(db, { autoStartWatchWorkout: false });
    await applyIosBootstrap(db, await cloudFixture().bootstrap());
    expect((await getLocalPreferences(db)).autoStartWatchWorkout).toBe(false);
    expect((await getLocalPreferences(db)).unit).toBe("lb");
  });

  it("converges after an hour of settings edits with one-minute upload windows and five-minute gaps", async () => {
    const { db, sql } = await openDatabase();
    const cloud = cloudFixture();
    let now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    await applyIosBootstrap(db, await cloud.bootstrap());
    let intended;
    for (let minute = 0; minute < 60; minute++) {
      now += 60_000;
      intended = {
        unit: minute % 2 ? "kg" : "lb",
        activeWorkoutMode: minute % 2 ? "list" : "focus",
        restTimerEnabled: minute % 2 === 0,
        barWeightLb: 35 + (minute % 10),
        barWeightKg: 15 + (minute % 6),
      };
      await patchLocalPreferences(db, intended);
      await applyIosBootstrap(db, await cloud.bootstrap());
      expect(await getLocalPreferences(db)).toMatchObject(intended);
      if (minute % 6 === 0) await sync(db, cloud);
    }
    expect(await getPendingPreferencesSync(db)).not.toBeNull();
    await sync(db, cloud);
    expect(cloud.user).toMatchObject(intended);
    expect(await getLocalPreferences(db)).toMatchObject(intended);
    expect(await getPendingPreferencesSync(db)).toBeNull();
    expect(pendingGuard(sql)).toBeUndefined();
  });
});
