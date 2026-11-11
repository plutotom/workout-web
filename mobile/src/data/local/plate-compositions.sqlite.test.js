import { createLocalBackup, restoreLocalBackup } from "./backup";
import { parseBackup, serializeBackup } from "@shared/workout-backup";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
import { migrateLocalDatabase as migrateReleased } from "./fixtures/released-v9";
import { migrateLocalDatabase } from "./migrations";
import {
  readPlateComposition,
  parsePlateComposition,
} from "./plate-compositions";
import {
  updateLocalSet,
  replaceLocalExercise,
  getPendingSessionSync,
  completeSessionSync,
  adoptRemoteCompletedListWorkout,
} from "./repository";

const dirs = [];
const connections = new Set();
function open(path) {
  const sql = new DatabaseSync(path);
  connections.add(sql);
  const db = {
    execAsync: async (s) => sql.exec(s),
    runAsync: async (s, ...v) => sql.prepare(s).run(...v.flat()),
    getFirstAsync: async (s, ...v) => sql.prepare(s).get(...v.flat()) ?? null,
    getAllAsync: async (s, ...v) => sql.prepare(s).all(...v.flat()),
    withTransactionAsync: async (fn) => transaction(fn),
    withExclusiveTransactionAsync: async (fn) => transaction(() => fn(db)),
  };
  async function transaction(fn) {
    sql.exec("BEGIN");
    try {
      await fn();
      sql.exec("COMMIT");
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  }
  return {
    sql,
    db,
    close() {
      sql.close();
      connections.delete(sql);
    },
  };
}
afterEach(() => {
  for (const sql of connections) sql.close();
  connections.clear();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const composition = {
  unit: "lb",
  bar: 45,
  countBar: true,
  counts: { 45: 1, 10: 2, 5: 1 },
};
const save = {
  weight: 185,
  plateComposition: { exerciseSlug: "bench-press", composition },
};
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "plate-upgrade-"));
  dirs.push(dir);
  const path = join(dir, "installed.db");
  const f = open(path);
  await migrateReleased(f.db);
  f.sql.exec(`
    INSERT INTO local_sessions (id, template_name, status, started_at, updated_at)
      VALUES ('workout', 'Existing workout', 'completed', 10, 20);
    INSERT INTO local_session_exercises (id, session_id, slug, order_index)
      VALUES ('bench', 'workout', 'bench-press', 0), ('squat', 'workout', 'squat', 1);
    INSERT INTO local_sets (id, session_exercise_id, order_index, weight, reps, completed)
      VALUES ('set', 'bench', 0, 185, 5, 1), ('other', 'squat', 0, 185, 5, 1);
  `);
  return { ...f, path };
}
it("upgrades the released v9 disk database, preserves records, and restores exact plates after restart", async () => {
  let f = await fixture();
  const before = f.sql.prepare("SELECT * FROM local_sets").all();
  await migrateLocalDatabase(f.db);
  expect(f.sql.prepare("SELECT * FROM local_sets").all()).toEqual(before);
  expect(await readPlateComposition(f.db, "set", "bench-press")).toBeNull();
  await updateLocalSet(f.db, "set", save);
  expect(await readPlateComposition(f.db, "other", "squat")).toBeNull();
  expect(
    f.sql
      .prepare("SELECT payload_json FROM local_sync_outbox")
      .all()
      .every((row) => !row.payload_json.includes("composition")),
  ).toBe(true);
  const path = f.path;
  f.close();
  f = open(path);
  await migrateLocalDatabase(f.db);
  expect(await readPlateComposition(f.db, "set", "bench-press")).toEqual(
    composition,
  );
  const otherAccount = open(join(dirs[0], "other-account.db"));
  await migrateLocalDatabase(otherAccount.db);
  expect(
    await readPlateComposition(otherAccount.db, "set", "bench-press"),
  ).toBeNull();
  await replaceLocalExercise(f.db, "bench", "deadlift");
  expect(await readPlateComposition(f.db, "set", "bench-press")).toBeNull();
});
it("rolls back weight, plates and outbox together on interrupted writes, then retries", async () => {
  const f = await fixture();
  await migrateLocalDatabase(f.db);
  const run = f.db.runAsync;
  f.db.runAsync = async (s, ...v) => {
    if (s.includes("INSERT INTO local_sync_outbox"))
      throw new Error("interrupted");
    return run(s, ...v);
  };
  await expect(
    updateLocalSet(f.db, "set", {
      ...save,
      weight: 155,
      plateComposition: {
        exerciseSlug: "bench-press",
        composition: { ...composition, counts: { 45: 1, 10: 1 } },
      },
    }),
  ).rejects.toThrow("interrupted");
  expect(
    f.sql.prepare("SELECT weight FROM local_sets WHERE id = 'set'").get()
      .weight,
  ).toBe(185);
  expect(await readPlateComposition(f.db, "set", "bench-press")).toBeNull();
  expect(f.sql.prepare("SELECT * FROM local_sync_outbox").all()).toEqual([]);
  f.db.runAsync = run;
  await updateLocalSet(f.db, "set", save);
  expect(await readPlateComposition(f.db, "set", "bench-press")).toEqual(
    composition,
  );
});

it("keeps local composition through pending delivery, acknowledgement and cloud readoption", async () => {
  const f = await fixture();
  await migrateLocalDatabase(f.db);
  await updateLocalSet(f.db, "set", save);
  const pending = await getPendingSessionSync(f.db);
  const remote = {
    _id: "cloud-workout",
    clientId: "workout",
    clientUpdatedAt: Date.now() + 10000,
    templateId: null,
    noteBody: null,
    noteUnit: null,
    templateName: "Existing workout",
    status: "completed",
    sessionKind: "tracked",
    inputMode: "list",
    startedAt: 10,
    completedAt: 20,
    countsTowardGoals: true,
    placeId: null,
    placeName: null,
    exercises: [
      {
        _id: "bench",
        slug: "bench-press",
        restSeconds: 75,
        sets: [
          {
            _id: "set",
            orderIndex: 0,
            weight: 185,
            reps: 5,
            completed: true,
            completedAt: 20,
          },
        ],
      },
    ],
  };
  await adoptRemoteCompletedListWorkout(f.db, remote);
  expect(await readPlateComposition(f.db, "set", "bench-press")).toEqual(
    composition,
  );
  await completeSessionSync(
    f.db,
    pending.operationId,
    "workout",
    "cloud-workout",
  );
  await adoptRemoteCompletedListWorkout(f.db, remote);
  expect(await readPlateComposition(f.db, "set", "bench-press")).toEqual(
    composition,
  );
});
it("rejects malformed cache and mismatched compositions without touching existing sets", async () => {
  expect(
    parsePlateComposition(
      '{"unit":"lb","bar":45,"countBar":true,"counts":{"999":1}}',
    ),
  ).toBeNull();
  const f = await fixture();
  await migrateLocalDatabase(f.db);
  await expect(
    updateLocalSet(f.db, "set", { ...save, weight: 155 }),
  ).rejects.toThrow("does not match");
  expect(
    f.sql.prepare("SELECT weight FROM local_sets WHERE id = 'set'").get()
      .weight,
  ).toBe(185);
});

it("rolls back an interrupted v9 upgrade and retries after reopening the installed database", async () => {
  const f = await fixture();
  const before = f.sql.prepare("SELECT * FROM local_sets").all();
  const exec = f.db.execAsync;
  f.db.execAsync = async (statement) => {
    await exec(statement);
    if (
      statement.includes("CREATE TABLE IF NOT EXISTS local_plate_compositions")
    )
      throw new Error("interrupted upgrade");
  };
  await expect(migrateLocalDatabase(f.db)).rejects.toThrow(
    "interrupted upgrade",
  );
  expect(f.sql.prepare("PRAGMA user_version").get().user_version).toBe(9);
  expect(f.sql.prepare("SELECT * FROM local_sets").all()).toEqual(before);
  const path = f.path;
  f.close();
  const reopened = open(path);
  await migrateLocalDatabase(reopened.db);
  expect(reopened.sql.prepare("PRAGMA user_version").get().user_version).toBe(
    10,
  );
  expect(reopened.sql.prepare("SELECT * FROM local_sets").all()).toEqual(
    before,
  );
  await updateLocalSet(reopened.db, "set", save);
  expect(await readPlateComposition(reopened.db, "set", "bench-press")).toEqual(
    composition,
  );
});

it("restores exact plates from a file backup into a fresh installation without duplicates or sync payload changes", async () => {
  const source = await fixture();
  await migrateLocalDatabase(source.db);
  await updateLocalSet(source.db, "set", save);
  const exported = await createLocalBackup(source.db);
  const parsed = parseBackup(serializeBackup(exported));
  expect(parsed.ok).toBe(true);
  const restored = open(join(dirs[0], "reinstalled.db"));
  await migrateLocalDatabase(restored.db);
  await restoreLocalBackup(restored.db, parsed.snapshot);
  const set = restored.sql
    .prepare(
      `SELECT s.id, s.weight FROM local_sets s JOIN local_session_exercises e ON s.session_exercise_id = e.id WHERE e.slug = 'bench-press'`,
    )
    .get();
  expect(set.weight).toBe(185);
  expect(
    await readPlateComposition(restored.db, set.id, "bench-press"),
  ).toEqual(composition);
  await restoreLocalBackup(restored.db, parsed.snapshot);
  expect(
    restored.sql.prepare("SELECT count(*) n FROM local_sets").get().n,
  ).toBe(2);
  expect(
    restored.sql
      .prepare("SELECT payload_json FROM local_sync_outbox")
      .all()
      .every((row) => !row.payload_json.includes("plateComposition")),
  ).toBe(true);
});
