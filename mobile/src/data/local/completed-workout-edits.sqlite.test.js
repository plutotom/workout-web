import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
import { migrateLocalDatabase } from "./migrations";
import {
  adoptRemoteCompletedListWorkout,
  getLocalWorkout,
  getPendingSessionSync,
  saveLocalSessionExerciseNote,
  updateLocalSet,
  addLocalSet,
  deleteLocalSet,
  addLocalExercise,
  removeLocalExercise,
  replaceLocalExercise,
  moveLocalExercise,
  setLocalSessionPlace,
  setLocalSessionMachine,
  startLocalBlankWorkout,
} from "./repository";
import { DEFAULT_MACHINE_KEY } from "@shared/place-memory";

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
function remote(overrides = {}) {
  return {
    _id: "remote-workout",
    clientId: null,
    clientUpdatedAt: 100,
    templateId: "k17abcdefghijklmnopqrstuvwxy12345",
    templateName: "Push",
    status: "completed",
    sessionKind: "tracked",
    inputMode: "list",
    noteBody: null,
    noteUnit: null,
    startedAt: 10,
    completedAt: 20,
    countsTowardGoals: true,
    placeId: null,
    placeName: null,
    exercises: [
      {
        _id: "exercise",
        slug: "bench-press",
        restSeconds: 75,
        sets: [
          {
            _id: "set",
            orderIndex: 0,
            weight: 135,
            reps: 5,
            completed: true,
            completedAt: 20,
          },
        ],
      },
    ],
    ...overrides,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const sql of databases.splice(0)) sql.close();
});

it("preserves a web workout's template identity in its next upload", async () => {
  const { db } = await fixture();
  const workout = remote();
  await adoptRemoteCompletedListWorkout(db, workout);
  await updateLocalSet(db, "set", { weight: 145 });
  expect((await getPendingSessionSync(db)).snapshot.remoteTemplateId).toBe(
    workout.templateId,
  );
});

it("editing an old session note preserves newer working weights", async () => {
  const { db, sql } = await fixture();
  await adoptRemoteCompletedListWorkout(
    db,
    remote({ placeId: "gym", placeName: "Gym" }),
  );
  sql
    .prepare(
      "INSERT INTO local_exercise_place_weights (place_id, exercise_slug, machine_key, sets_json, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      "gym",
      "bench-press",
      DEFAULT_MACHINE_KEY,
      JSON.stringify([{ weight: 225, reps: 5 }]),
      500,
    );
  await saveLocalSessionExerciseNote(
    db,
    "exercise",
    "Old session note corrected",
  );
  const memory = sql
    .prepare(
      "SELECT sets_json FROM local_exercise_place_weights WHERE place_id = ? AND exercise_slug = ?",
    )
    .get("gym", "bench-press");
  expect(JSON.parse(memory.sets_json)).toEqual([{ weight: 225, reps: 5 }]);
});

it("allows clearing a session note when a global cue exists", async () => {
  const { db, sql } = await fixture();
  await adoptRemoteCompletedListWorkout(db, remote());
  sql
    .prepare(
      "INSERT INTO local_exercise_notes (slug, notes, updated_at) VALUES (?, ?, ?)",
    )
    .run("bench-press", "Global cue", 1);
  await saveLocalSessionExerciseNote(db, "exercise", "");
  expect(
    (await getLocalWorkout(db, "remote-workout")).exercises[0].notes ?? "",
  ).toBe("");
});

it("a cloud refresh between the set write and outbox cannot erase the edit", async () => {
  const { db } = await fixture();
  await adoptRemoteCompletedListWorkout(db, remote());
  const run = db.runAsync.bind(db);
  let releaseWrite;
  let enteredWrite;
  const blocked = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const entered = new Promise((resolve) => {
    enteredWrite = resolve;
  });
  vi.spyOn(db, "runAsync").mockImplementation(async (statement, ...values) => {
    const result = await run(statement, ...values);
    if (statement.startsWith("UPDATE local_sets SET")) {
      enteredWrite();
      await blocked;
    }
    return result;
  });
  const edit = updateLocalSet(db, "set", { weight: 155 });
  await entered;
  const refresh = adoptRemoteCompletedListWorkout(
    db,
    remote({ clientUpdatedAt: 200 }),
  );
  releaseWrite();
  await Promise.all([edit, refresh]);
  expect(
    (await getPendingSessionSync(db)).snapshot.exercises[0].sets[0].weight,
  ).toBe(155);
  expect(
    (await getLocalWorkout(db, "remote-workout")).exercises[0].sets[0].weight,
  ).toBe(155);
});

it("replaces a completed lift in place, reseeds from the new exercise, and queues one snapshot", async () => {
  const { db, sql } = await fixture();
  await adoptRemoteCompletedListWorkout(
    db,
    remote({ placeId: "gym", placeName: "Gym" }),
  );
  await saveLocalSessionExerciseNote(db, "exercise", "Bench cue for this day");
  sql
    .prepare(
      "INSERT INTO local_exercise_place_weights (place_id, exercise_slug, machine_key, sets_json, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      "gym",
      "squat",
      DEFAULT_MACHINE_KEY,
      JSON.stringify([{ weight: 225, reps: 8 }]),
      500,
    );
  await replaceLocalExercise(db, "exercise", "squat");
  const row = sql
    .prepare("SELECT id, slug, notes, order_index FROM local_session_exercises")
    .get();
  expect(row).toMatchObject({
    id: "exercise",
    slug: "squat",
    notes: null,
    order_index: 0,
  });
  const set = sql
    .prepare(
      "SELECT id, weight, reps, target_weight, target_reps, completed FROM local_sets WHERE id = ?",
    )
    .get("set");
  expect(set).toMatchObject({
    id: "set",
    weight: 225,
    reps: 8,
    target_weight: 225,
    target_reps: 8,
    completed: 1,
  });
  const snapshot = (await getPendingSessionSync(db)).snapshot;
  expect(snapshot.exercises[0]).toMatchObject({
    clientId: "exercise",
    slug: "squat",
    sets: [{ clientId: "set", weight: 225, reps: 8, completed: true }],
  });
});

it("unchecks logged sets when replacing during an active workout", async () => {
  const { db } = await fixture();
  const sessionId = await startLocalBlankWorkout(db);
  const exerciseId = await addLocalExercise(db, sessionId, "push-up");
  const workout = await getLocalWorkout(db, sessionId);
  const setId = workout.exercises[0].sets[0]._id;
  await updateLocalSet(db, setId, { completed: true, reps: 15 });
  await replaceLocalExercise(db, exerciseId, "dip");
  const replaced = await getLocalWorkout(db, sessionId);
  expect(replaced.exercises[0]).toMatchObject({
    _id: exerciseId,
    slug: "dip",
  });
  expect(replaced.exercises[0].sets[0]).toMatchObject({
    _id: setId,
    completed: false,
    weight: 0,
    reps: 0,
  });
  expect(replaced.exercises[0].sets).toHaveLength(
    workout.exercises[0].sets.length,
  );
});

it("rejects replacing with a lift already in the workout", async () => {
  const { db } = await fixture();
  await adoptRemoteCompletedListWorkout(db, remote());
  await addLocalExercise(db, "remote-workout", "squat");
  await expect(replaceLocalExercise(db, "exercise", "squat")).rejects.toThrow(
    "Exercise already in workout",
  );
  expect((await getLocalWorkout(db, "remote-workout")).exercises[0].slug).toBe(
    "bench-press",
  );
});

it.each([
  ["set values", (db) => updateLocalSet(db, "set", { weight: 155 })],
  ["add set", (db) => addLocalSet(db, "exercise")],
  ["delete set", (db) => deleteLocalSet(db, "set")],
  ["add exercise", (db) => addLocalExercise(db, "remote-workout", "squat")],
  ["remove exercise", (db) => removeLocalExercise(db, "exercise")],
  ["replace exercise", (db) => replaceLocalExercise(db, "exercise", "squat")],
  ["reorder exercise", (db) => moveLocalExercise(db, "exercise", 1)],
  [
    "session note",
    (db) => saveLocalSessionExerciseNote(db, "exercise", "Edited"),
  ],
  ["place", (db) => setLocalSessionPlace(db, "remote-workout", "gym")],
  ["machine", (db) => setLocalSessionMachine(db, "exercise", "machine")],
])(
  "rolls back %s, its revision and equipment memory if queueing fails, then retries",
  async (_name, edit) => {
    const { db, sql } = await fixture();
    const workout = remote({ placeId: "gym", placeName: "Gym" });
    workout.exercises[0].sets.push({
      ...workout.exercises[0].sets[0],
      _id: "set-2",
      orderIndex: 1,
    });
    workout.exercises.push({ _id: "exercise-2", slug: "ohp", sets: [] });
    await adoptRemoteCompletedListWorkout(db, workout);
    sql
      .prepare(
        "INSERT INTO local_machines (id, place_id, exercise_slug, name, is_default, archived, updated_at) VALUES (?, ?, ?, ?, 0, 0, 1)",
      )
      .run("machine", "gym", "bench-press", "Corner");
    const tables = [
      "local_sessions",
      "local_session_exercises",
      "local_sets",
      "local_exercise_place_weights",
      "local_sync_outbox",
      "local_places",
      "local_machines",
    ];
    const rows = () =>
      Object.fromEntries(
        tables.map((table) => [
          table,
          sql.prepare(`SELECT * FROM ${table}`).all(),
        ]),
      );
    const before = rows();
    const run = db.runAsync.bind(db);
    const failure = vi
      .spyOn(db, "runAsync")
      .mockImplementation(async (statement, ...values) => {
        if (
          statement.includes("INSERT INTO local_sync_outbox") &&
          statement.includes("'session'")
        ) {
          throw new Error("outbox interrupted");
        }
        return run(statement, ...values);
      });
    await expect(edit(db)).rejects.toThrow("outbox interrupted");
    expect(rows()).toEqual(before);
    failure.mockRestore();
    await edit(db);
    expect(await getPendingSessionSync(db)).not.toBeNull();
  },
);

it("resolves local template and machine aliases while adopting a newer cloud correction", async () => {
  const { db, sql } = await fixture();
  const workout = remote({ placeId: "gym", placeName: "Gym" });
  await adoptRemoteCompletedListWorkout(db, workout);
  sql
    .prepare(
      "INSERT INTO local_templates (id, remote_id, name, updated_at) VALUES (?, ?, 'Push', 1)",
    )
    .run("local-template", workout.templateId);
  sql
    .prepare(
      "INSERT INTO local_machines (id, remote_id, place_id, exercise_slug, name, is_default, archived, updated_at) VALUES (?, ?, ?, ?, 'Corner', 0, 0, 1)",
    )
    .run("local-machine", "remote-machine", "gym", "bench-press");
  workout.clientUpdatedAt = 200;
  workout.exercises[0].machineId = "remote-machine";
  await adoptRemoteCompletedListWorkout(db, workout);
  const adopted = await getLocalWorkout(db, workout._id);
  expect(adopted.templateId).toBe("local-template");
  expect(adopted.remoteTemplateId).toBe(workout.templateId);
  expect(adopted.exercises[0].machineId).toBe("local-machine");
});
