import { act } from "react-test-renderer";
import { renameSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../backend/_generated/api";
import { convertWeight } from "../../src/lib/workout-export";
import {
  PhoneScenario,
  installTestEnvironment,
  restoreTestEnvironment,
} from "./harness";
import {
  accountDatabaseName,
  prepareScopedDatabase,
  LEGACY_DATABASE,
} from "@/data/local/storage-scopes";
import {
  listNoteAlternatives,
  keepNoteAlternative,
} from "@/data/local/note-recovery";
import { SESSION_KEY, USER_KEY } from "@/auth/session-controller";
import {
  parseBackup,
  serializeBackup,
  restoreLocalBackup,
} from "@/data/local/backup";
import { migrateLocalDatabase } from "@/data/local/migrations";

let phone;
const ALICE = "user_test_alice";
const BOB = "user_test_bob";

async function moveCurrentDatabaseToLegacy(stamped) {
  const name = phone.databaseName;
  if (!stamped)
    phone.sql.exec(
      "DELETE FROM local_metadata WHERE key LIKE 'storage:%' OR key LIKE 'note:%' OR key LIKE 'recovery:%'",
    );
  await phone.unmount();
  for (const { sql } of phone.databases.values()) sql.close();
  phone.databases.clear();
  renameSync(
    join(phone.directory, name),
    join(phone.directory, LEGACY_DATABASE),
  );
}
beforeEach(async () => {
  installTestEnvironment();
  phone = await new PhoneScenario().open();
});
afterEach(async () => {
  await phone?.close();
  restoreTestEnvironment();
});

async function seedExistingAccount(subject = ALICE, unit = "lb") {
  const userId = await phone.cloud.run((ctx) =>
    ctx.db.insert("users", {
      workosId: subject,
      email: `${subject}@example.invalid`,
      unit,
      createdAt: Date.now() - 86_400_000,
      restTimerEnabled: false,
    }),
  );
  await phone.as(subject).mutation(api.routes.ios.sync.pushTemplate, {
    operationId: `cloud-template-${subject}`,
    deviceId: "another-device",
    template: {
      remoteId: null,
      name: "Existing cloud pull",
      exercises: [{ slug: "ohp", sets: [{ weight: 75, reps: 5 }] }],
    },
  });
  await phone.as(subject).mutation(api.routes.ios.sync.pushExerciseNote, {
    operationId: `cloud-note-${subject}`,
    deviceId: "another-device",
    note: { slug: "ohp", notes: "Existing cloud cue" },
  });
  // A real legacy row: no client id or fields added by later iOS builds.
  await phone.cloud.run((ctx) =>
    ctx.db.insert("workoutSessions", {
      userId,
      status: "completed",
      startedAt: 100,
      completedAt: 200,
      templateName: "Existing cloud workout",
    }),
  );
  return phone.records(subject);
}

async function seedOfflineData(unit = "lb") {
  await phone.continueOffline();
  if (unit !== "lb")
    await phone.edit((local) => local.setGeneralPreferences({ unit }));
  const place = await phone.edit((local) => local.createPlace("Offline gym"));
  const lift = await phone.edit((local) =>
    local.saveCustomExercise({
      name: "Offline press",
      category: "chest",
      usesBar: false,
    }),
  );
  const machine = await phone.edit((local) =>
    local.createMachine({
      placeId: place._id,
      exerciseSlug: "bench",
      name: "Bench one",
    }),
  );
  const templateId = await phone.edit((local) =>
    local.saveTemplate({
      name: "Offline push",
      exercises: [
        { slug: "bench", sets: [{ weight: 135, reps: 5 }] },
        { slug: lift.slug, sets: [{ weight: 40, reps: 8 }] },
      ],
    }),
  );
  const sessionId = await phone.edit((local) =>
    local.startFromTemplate(templateId, false, place._id),
  );
  const workout = await phone.workout(sessionId);
  await phone.edit((local) =>
    local.setSessionMachine(workout.exercises[0]._id, machine._id),
  );
  await phone.edit((local) =>
    local.updateSet(workout.exercises[0].sets[0]._id, {
      weight: 150,
      reps: 6,
      completed: true,
    }),
  );
  await phone.edit((local) => local.saveNote("bench", "Pause at the bottom"));
  await phone.edit((local) => local.saveNote(lift.slug, "Slow descent"));
  await phone.edit((local) =>
    local.setGeneralPreferences({
      activeWorkoutMode: "focus",
      barWeightLb: 35,
    }),
  );
  await phone.edit((local) => local.finish(sessionId));
  return { sessionId, templateId, lift };
}

async function assertOfflineDataMerged({ sessionId, lift }, original) {
  const records = await phone.records(ALICE);
  expect(records.workoutTemplates).toHaveLength(original ? 2 : 1);
  expect(records.workoutSessions).toHaveLength(original ? 2 : 1);
  expect(records.user).toMatchObject({
    unit: "lb",
    barWeightLb: 35,
    activeWorkoutMode: "focus",
  });
  expect(records.user.restTimerEnabled ?? true).toBe(!original);
  expect((await phone.preferences()).restTimerEnabled).toBe(!original);
  expect(records.sets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ weight: 150, reps: 6, completed: true }),
      expect.objectContaining({ weight: 40, reps: 8, completed: false }),
    ]),
  );
  expect(records.sets).toHaveLength(2);
  expect(records.sessionExercises).toHaveLength(2);
  expect(records.templateExercises).toHaveLength(original ? 3 : 2);
  expect(records.exerciseNotes).toHaveLength(original ? 3 : 2);
  expect(records.places).toHaveLength(1);
  // Creating the first named machine also materializes the default station.
  expect(records.machines).toHaveLength(2);
  const cloudSession = records.workoutSessions.find(
    (row) => row.clientId === sessionId,
  );
  const place = records.places[0];
  const machine = records.machines.find((row) => row.name === "Bench one");
  expect(records.machines.filter((row) => row.isDefault)).toHaveLength(1);
  expect(
    records.machines.every(
      (row) => row.placeId === place._id && row.userId === records.user._id,
    ),
  ).toBe(true);
  expect(place).toMatchObject({
    name: "Offline gym",
    userId: records.user._id,
  });
  expect(machine).toMatchObject({
    name: "Bench one",
    userId: records.user._id,
    placeId: place._id,
    exerciseSlug: "bench",
  });
  expect(cloudSession).toMatchObject({
    placeId: place._id,
    placeName: place.name,
  });
  expect(
    records.sessionExercises.every((row) => row.sessionId === cloudSession._id),
  ).toBe(true);
  const bench = records.sessionExercises.find(
    (row) => row.exerciseSlug === "bench",
  );
  expect(bench).toMatchObject({
    machineId: machine._id,
    machineName: machine.name,
  });
  expect(
    records.sets.filter((row) => row.sessionExerciseId === bench._id),
  ).toMatchObject([{ weight: 150, reps: 6 }]);
  expect(records.customExercises).toHaveLength(1);
  const customSlug = `custom:${records.customExercises[0]._id}`;
  expect(records.exerciseNotes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        exerciseSlug: "bench",
        notes: "Pause at the bottom",
      }),
      expect.objectContaining({
        exerciseSlug: customSlug,
        notes: "Slow descent",
      }),
    ]),
  );
  expect(records.templateExercises.map((row) => row.exerciseSlug)).toContain(
    customSlug,
  );
  expect(records.sessionExercises.map((row) => row.exerciseSlug)).toContain(
    customSlug,
  );
  const custom = records.sessionExercises.find(
    (row) => row.exerciseSlug === customSlug,
  );
  expect(
    records.sets.filter((row) => row.sessionExerciseId === custom._id),
  ).toMatchObject([{ weight: 40, reps: 8 }]);
  const workout = await phone.workout(sessionId);
  expect(workout).toMatchObject({
    status: "completed",
    templateName: "Offline push",
    placeName: "Offline gym",
  });
  expect(workout.exercises[0].machineName).toBe("Bench one");
  expect(workout.exercises[1].slug).toBe(customSlug);
  expect(
    phone.sql
      .prepare("SELECT slug FROM local_custom_exercises WHERE id = ?")
      .get(lift._id).slug,
  ).toBe(customSlug);
  if (original) {
    expect(records.user._id).toBe(original.user._id);
    expect(records.workoutSessions).toContainEqual(original.workoutSessions[0]);
    expect(records.workoutTemplates).toContainEqual(
      original.workoutTemplates[0],
    );
    expect(records.exerciseNotes).toContainEqual(original.exerciseNotes[0]);
  }
  expect(phone.outbox()).toHaveLength(0);
  return records;
}

describe("offline account lifecycle with SQLite and Convex", () => {
  it.each(
    ["new", "existing"].flatMap((kind) =>
      ["before-ack", "after-ack"].map((subscriptionOrder) => ({
        kind,
        subscriptionOrder,
      })),
    ),
  )(
    "merges guest offline data into a $kind account with subscription $subscriptionOrder and repeated sign-in creates no duplicates",
    async ({ kind, subscriptionOrder }) => {
      phone.subscriptionOrder = subscriptionOrder;
      const original = kind === "existing" ? await seedExistingAccount() : null;
      const local = await seedOfflineData();
      expect(phone.calls).toHaveLength(0);
      expect(phone.outbox().length).toBeGreaterThan(0);
      const pending = phone.outbox();
      await phone.reopen();
      expect(phone.outbox()).toEqual(pending);
      await phone.assertLocalData(local.sessionId, {
        templateName: "Offline push",
        status: "completed",
      });
      await phone.connect();
      await phone.signIn(ALICE);
      await phone.settle();
      const merged = await assertOfflineDataMerged(local, original);
      expect(phone.calls.length).toBeGreaterThan(0);
      expect(
        phone.calls.every(
          (call) =>
            call.delivered &&
            call.subscriptionDeliveredBeforeAck ===
              (subscriptionOrder === "before-ack"),
        ),
      ).toBe(true);
      await phone.signIn(ALICE);
      await phone.settle();
      const repeated = await phone.records(ALICE);
      expect(repeated).toEqual(merged);
      expect(
        await phone.cloud.run((ctx) => ctx.db.query("users").collect()),
      ).toHaveLength(1);
    },
  );

  it("cannot sign in or upload while disconnected, and keeps guest data for a later successful sign-in", async () => {
    const local = await seedOfflineData();
    await expect(phone.signIn(ALICE)).rejects.toThrow("Network request failed");
    await phone.tick(300_000);
    expect(phone.calls).toHaveLength(0);
    expect(
      await phone.cloud.run((ctx) => ctx.db.query("users").collect()),
    ).toHaveLength(0);
    await phone.assertLocalData(local.sessionId, { status: "completed" });
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await assertOfflineDataMerged(local);
  });

  it("keeps an existing account and pending edits through an offline process restart, then reconnects", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.offline();
    const sessionId = await phone.edit((local) => local.startNote());
    await phone.edit((local) =>
      local.saveWorkoutNote(sessionId, "Bench 6 @ 150\nA long offline note"),
    );
    await phone.edit((local) => local.setGeneralPreferences({ unit: "kg" }));
    const pending = phone.outbox();
    await phone.reopen();
    expect(phone.auth.getSnapshot()).toMatchObject({
      user: { id: ALICE },
      hasAccessToken: false,
      localMode: true,
    });
    expect(phone.outbox()).toEqual(pending);
    await phone.assertLocalData(sessionId, {
      inputMode: "note",
      noteBody: "Bench 6 @ 150\nA long offline note",
      noteUnit: "lb",
    });
    expect((await phone.records(ALICE)).workoutSessions).toHaveLength(0);
    await phone.connect();
    await phone.settle();
    expect((await phone.records(ALICE)).user.unit).toBe("kg");
    expect((await phone.records(ALICE)).workoutSessions).toMatchObject([
      {
        inputMode: "note",
        noteBody: "Bench 6 @ 150\nA long offline note",
        noteUnit: "lb",
      },
    ]);
  });

  it("retries a server commit whose response was lost after a process restart, without duplicate workouts or sets", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    phone.faults.push({ name: "pushSession", loseResponse: true });
    const sessionId = await phone.edit((local) => local.startBlank());
    await phone.edit((local) =>
      local.addExercise(sessionId, "bench", [{ weight: 135, reps: 5 }]),
    );
    await phone.tick();
    const operationId = phone.calls.find(
      (call) => call.name === "pushSession",
    ).operationId;
    expect(
      phone.calls.find((call) => call.operationId === operationId).committed,
    ).toBe(true);
    expect(phone.outbox()).toHaveLength(1);
    await phone.offline();
    await phone.reopen();
    expect(phone.outbox()[0].operation_id).toBe(operationId);
    await phone.connect();
    await phone.settle();
    const records = await phone.records(ALICE);
    expect(records.workoutSessions).toHaveLength(1);
    expect(records.sessionExercises).toHaveLength(1);
    expect(records.sets).toHaveLength(1);
    expect(
      records.iosSyncReceipts.filter((row) => row.operationId === operationId),
    ).toHaveLength(1);
    expect(
      phone.calls.filter((call) => call.operationId === operationId),
    ).toHaveLength(2);
  });

  it("keeps a newer offline edit when an older upload acknowledgment arrives late", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const held = phone.holdNext("pushPreferences");
    await phone.edit((local) =>
      local.setGeneralPreferences({ barWeightLb: 35 }),
    );
    await phone.tick();
    const older = await held.committed;
    await phone.offline();
    await phone.edit((local) =>
      local.setGeneralPreferences({ barWeightLb: 40 }),
    );
    const newest = phone.outbox()[0].operation_id;
    await act(async () => {
      held.release();
    });
    await phone.tick();
    expect(older.delivered).toBe(true);
    expect(older.operationId).not.toBe(newest);
    expect((await phone.preferences()).barWeightLb).toBe(40);
    expect(phone.outbox()[0].operation_id).toBe(newest);
    await phone.connect();
    await phone.settle();
    expect((await phone.records(ALICE)).user.barWeightLb).toBe(40);
  });

  it("does not upload background edits until the app returns to the foreground", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.appState("background");
    await phone.edit((local) =>
      local.saveNote("bench", "Queued in background"),
    );
    await phone.tick(300_000);
    expect((await phone.records(ALICE)).exerciseNotes).toHaveLength(0);
    expect(phone.outbox()).toHaveLength(1);
    await phone.appState("active");
    await phone.settle();
    expect((await phone.records(ALICE)).exerciseNotes).toMatchObject([
      { notes: "Queued in background" },
    ]);
  });

  it("drains more than one worker batch without dropping templates", async () => {
    await phone.continueOffline();
    for (let index = 0; index < 25; index++)
      await phone.edit((local) =>
        local.saveTemplate({
          name: `Offline template ${index}`,
          exercises: [{ slug: "bench", sets: [{ weight: index, reps: 5 }] }],
        }),
      );
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    expect((await phone.records(ALICE)).workoutTemplates).toHaveLength(25);
    expect(
      new Set(
        (await phone.records(ALICE)).workoutTemplates.map((row) => row.name),
      ).size,
    ).toBe(25);
  });

  it("migrates a populated version 7 database and old queued payload before account merge", async () => {
    const original = await seedExistingAccount();
    const sessionId = await phone.edit((local) => local.startBlank());
    await phone.edit((local) =>
      local.addExercise(sessionId, "bench", [{ weight: 100, reps: 5 }]),
    );
    const queue = phone.outbox()[0];
    const payload = JSON.parse(queue.payload_json);
    delete payload.inputMode;
    delete payload.noteBody;
    delete payload.noteUnit;
    phone.sql
      .prepare(
        "UPDATE local_sync_outbox SET payload_json = ? WHERE operation_id = ?",
      )
      .run(JSON.stringify(payload), queue.operation_id);
    // Reconstruct the prior shipped schema, preserving its actual rows and ids.
    phone.sql.exec(
      "ALTER TABLE local_sessions DROP COLUMN input_mode; ALTER TABLE local_sessions DROP COLUMN note_body; ALTER TABLE local_sessions DROP COLUMN note_unit; ALTER TABLE local_preferences DROP COLUMN auto_start_watch_workout; PRAGMA user_version = 7;",
    );
    await phone.reopen();
    expect(phone.sql.prepare("PRAGMA user_version").get().user_version).toBe(9);
    await phone.assertLocalData(sessionId, {
      inputMode: "list",
      exercises: [{ slug: "bench", sets: [{ weight: 100, reps: 5 }] }],
    });
    expect(phone.outbox()[0].operation_id).toBe(queue.operation_id);
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const records = await phone.records(ALICE);
    expect(records.workoutSessions).toHaveLength(2);
    expect(records.workoutSessions).toContainEqual(original.workoutSessions[0]);
    expect(records.sets).toMatchObject([{ weight: 100, reps: 5 }]);
  });

  it("preserves the account and offline data after token expiration, then refreshes and syncs", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.offline();
    await phone.edit((local) =>
      local.saveNote("bench", "Saved with an expired token"),
    );
    await phone.tick(3_600_001);
    await act(async () => {
      expect(await phone.auth.fetchAccessToken()).toBeNull();
    });
    expect(phone.auth.getSnapshot()).toMatchObject({
      user: { id: ALICE },
      hasAccessToken: false,
      localMode: true,
    });
    expect(phone.outbox()).toHaveLength(1);
    expect((await phone.notes(["bench"])).bench).toBe(
      "Saved with an expired token",
    );
    await phone.connect();
    await phone.settle();
    expect(phone.auth.getSnapshot().hasAccessToken).toBe(true);
    expect((await phone.records(ALICE)).exerciseNotes).toMatchObject([
      { notes: "Saved with an expired token" },
    ]);
  });

  it("the real backend rejects uploads with no authenticated, bootstrapped account", async () => {
    const args = {
      operationId: "unauthorized-operation",
      deviceId: "unauthorized-device",
      preferences: { unit: "kg" },
    };
    await expect(
      phone.cloud.mutation(api.routes.ios.sync.pushPreferences, args),
    ).rejects.toThrow("Not authenticated");
    await expect(
      phone.as(ALICE).mutation(api.routes.ios.sync.pushPreferences, args),
    ).rejects.toThrow("Not authenticated");
    expect(
      await phone.cloud.run((ctx) => ctx.db.query("iosSyncReceipts").collect()),
    ).toHaveLength(0);
  });

  it("merges cloud changes made while offline without overwriting queued local edits", async () => {
    const original = await seedExistingAccount();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.offline();
    await phone.edit((local) => local.saveNote("ohp", "Pending phone cue"));
    await phone.edit((local) =>
      local.setGeneralPreferences({ barWeightLb: 35 }),
    );
    for (const [slug, notes] of [
      ["ohp", "Conflicting cloud cue"],
      ["bench", "New cloud-only cue"],
    ]) {
      await phone.as(ALICE).mutation(api.routes.ios.sync.pushExerciseNote, {
        operationId: `cloud-offline-note-${slug}`,
        deviceId: "another-device",
        note: { slug, notes },
      });
    }
    await phone.as(ALICE).mutation(api.routes.ios.sync.pushPreferences, {
      operationId: "cloud-offline-prefs",
      deviceId: "another-device",
      preferences: { restTimerEnabled: true },
    });
    await phone.as(ALICE).mutation(api.routes.templates.mutations.remove, {
      templateId: original.workoutTemplates[0]._id,
    });
    expect(
      phone.sql
        .prepare("SELECT id FROM local_templates WHERE remote_id = ?")
        .get(original.workoutTemplates[0]._id),
    ).toBeDefined();
    expect((await phone.notes(["ohp"])).ohp).toBe("Pending phone cue");
    await phone.connect();
    await phone.settle();
    expect(await phone.notes(["ohp", "bench"])).toEqual({
      ohp: "Pending phone cue",
      bench: "New cloud-only cue",
    });
    expect(await phone.preferences()).toMatchObject({
      barWeightLb: 35,
      restTimerEnabled: true,
    });
    expect(
      phone.sql
        .prepare("SELECT id FROM local_templates WHERE remote_id = ?")
        .get(original.workoutTemplates[0]._id),
    ).toBeUndefined();
    const merged = await phone.records(ALICE);
    expect(
      merged.exerciseNotes.find((row) => row.exerciseSlug === "ohp").notes,
    ).toBe("Pending phone cue");
    expect(merged.workoutTemplates).toHaveLength(0);
    expect(merged.workoutSessions).toEqual(original.workoutSessions);
  });

  it("retries an offline workout deletion whose response was lost without resurrecting its children", async () => {
    const local = await seedOfflineData();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.offline();
    await phone.edit((data) => data.deleteSession(local.sessionId));
    expect(phone.outbox()).toMatchObject([{ entity_type: "session_delete" }]);
    expect((await phone.records(ALICE)).workoutSessions).toHaveLength(1);
    phone.faults.push({ name: "deleteSession", loseResponse: true });
    await phone.connect();
    await phone.settle();
    const merged = await phone.records(ALICE);
    expect(merged.workoutSessions).toHaveLength(0);
    expect(
      await phone.cloud.run((ctx) =>
        ctx.db.query("sessionExercises").collect(),
      ),
    ).toHaveLength(0);
    expect(
      await phone.cloud.run((ctx) => ctx.db.query("sets").collect()),
    ).toHaveLength(0);
    expect(merged.workoutTemplates).toHaveLength(1);
    const deletes = phone.calls.filter((call) => call.name === "deleteSession");
    expect(deletes).toHaveLength(2);
    expect(deletes[0].operationId).toBe(deletes[1].operationId);
    expect(
      merged.iosSyncReceipts.filter(
        (row) => row.operationId === deletes[0].operationId,
      ),
    ).toHaveLength(1);
  });

  it("preserves distinct custom lifts with the same name and remaps references to the correct lift", async () => {
    await seedExistingAccount();
    await phone.as(ALICE).mutation(api.routes.ios.sync.pushCustomExercise, {
      operationId: "cloud-custom-collision",
      deviceId: "another-device",
      exercise: {
        clientId: "cloud-custom",
        name: "Offline press",
        short: null,
        category: "back",
        usesBar: true,
        archived: false,
      },
    });
    const original = await phone.records(ALICE);
    await seedOfflineData();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const merged = await phone.records(ALICE);
    expect(merged.customExercises).toContainEqual(original.customExercises[0]);
    const guestLift = merged.customExercises.find(
      (row) => row.category === "chest",
    );
    expect(guestLift).toMatchObject({ name: "Offline press", usesBar: false });
    expect(merged.customExercises).toHaveLength(2);
    expect(merged.sessionExercises.map((row) => row.exerciseSlug)).toContain(
      `custom:${guestLift._id}`,
    );
    expect(merged.templateExercises.map((row) => row.exerciseSlug)).toContain(
      `custom:${guestLift._id}`,
    );
  });

  it.each([7, 41, 2026])(
    "converges after repeated five-minute offline / bounded online windows (seed %s)",
    async (seed) => {
      // A fixed schedule and seed make a reported stress failure reproducible.
      let random = seed;
      const next = () => {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        return random;
      };
      await phone.connect();
      await phone.signIn(ALICE);
      await phone.settle();
      const sessionId = await phone.edit((local) => local.startBlank());
      await phone.edit((local) =>
        local.addExercise(sessionId, "bench", [{ weight: 100, reps: 5 }]),
      );
      await phone.settle();
      const setId = (await phone.workout(sessionId)).exercises[0].sets[0]._id;
      for (let cycle = 0; cycle < 8; cycle++) {
        const before = await phone.records(ALICE);
        await phone.offline();
        const weight = 100 + (next() % 100);
        const cue = `Seed ${seed}, offline edit ${cycle}`;
        const mode = cycle % 2 ? "focus" : "list";
        await phone.edit((local) =>
          local.updateSet(setId, {
            weight,
            reps: 5 + cycle,
            completed: cycle > 0,
          }),
        );
        await phone.edit((local) => local.saveNote("bench", cue));
        await phone.edit((local) =>
          local.setGeneralPreferences({
            activeWorkoutMode: mode,
            barWeightLb: 35 + cycle,
          }),
        );
        await phone.tick(300_000);
        expect((await phone.records(ALICE)).sets).toEqual(before.sets);
        expect((await phone.records(ALICE)).exerciseNotes).toEqual(
          before.exerciseNotes,
        );
        expect((await phone.notes(["bench"])).bench).toBe(cue);
        if (cycle === 3) {
          const queued = phone.outbox();
          await phone.reopen();
          expect(phone.outbox()).toEqual(queued);
        }
        if (next() % 2)
          phone.faults.push({ name: "pushPreferences", loseResponse: true });
        await phone.connect();
        await phone.window(60_000);
        // Offline failures can leave a 60-second cooldown. Losing the first
        // successful response adds another capped retry. Allow both delays,
        // explicitly bounded; pending rows must survive the first minute.
        if (phone.outbox().length) {
          expect((await phone.notes(["bench"])).bench).toBe(cue);
          await phone.window(65_000);
        }
        expect(
          phone.outbox(),
          `Seed ${seed}, cycle ${cycle}: uploads should converge within the online window`,
        ).toHaveLength(0);
        const synced = await phone.records(ALICE);
        expect(synced.user).toMatchObject({
          activeWorkoutMode: mode,
          barWeightLb: 35 + cycle,
        });
        expect(synced.workoutSessions).toHaveLength(1);
        expect(synced.sessionExercises).toHaveLength(1);
        expect(synced.sets).toMatchObject([
          { weight, reps: 5 + cycle, completed: cycle > 0 },
        ]);
        expect(synced.exerciseNotes).toMatchObject([{ notes: cue }]);
        expect(
          new Set(synced.iosSyncReceipts.map((row) => row.operationId)).size,
        ).toBe(synced.iosSyncReceipts.length);
      }
    },
  );
});

describe("data preservation requirements", () => {
  it.each([
    ["lb", "kg"],
    ["kg", "lb"],
  ])(
    "waits for initial bootstrap before merging %s guest weights and notes into a %s account",
    async (guestUnit, accountUnit) => {
      await seedExistingAccount(ALICE, accountUnit);
      await phone.as(ALICE).mutation(api.routes.ios.sync.pushExerciseNote, {
        operationId: "initial-cloud-note",
        deviceId: "another-device",
        note: { slug: "bench", notes: "Cloud bench alternative" },
      });
      const local = await seedOfflineData(guestUnit);
      await phone.connect();
      phone.subscriptionOrder = "after-ack";
      const held = phone.holdNextBootstrap();
      await phone.signIn(ALICE);
      expect((await held.requested).subject).toBe(ALICE);
      expect(phone.readySubject).toBe(ALICE);
      await phone.window(5_000);
      expect(phone.bootstrap).toBeUndefined();
      expect(phone.calls).toHaveLength(0);
      expect(phone.outbox().length).toBeGreaterThan(0);
      const before = await phone.records(ALICE);
      expect(before.workoutSessions).toHaveLength(1);
      expect(
        before.exerciseNotes.find((row) => row.exerciseSlug === "bench").notes,
      ).toBe("Cloud bench alternative");

      await act(async () => held.release());
      await phone.settle();
      const records = await phone.records(ALICE);
      const session = records.workoutSessions.find(
        (row) => row.clientId === local.sessionId,
      );
      const exercise = records.sessionExercises.find(
        (row) => row.sessionId === session._id && row.exerciseSlug === "bench",
      );
      expect(records.user.unit).toBe(accountUnit);
      expect(
        records.sets.find((row) => row.sessionExerciseId === exercise._id)
          .weight,
      ).toBe(convertWeight(150, guestUnit, accountUnit));
      expect(
        (await phone.workout(local.sessionId)).exercises[0].sets[0].weight,
      ).toBe(convertWeight(150, guestUnit, accountUnit));
      expect(
        records.exerciseNotes.find((row) => row.exerciseSlug === "bench").notes,
      ).toBe("Pause at the bottom");
      expect(await listNoteAlternatives(phone.db)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: "bench",
            notes: "Cloud bench alternative",
          }),
        ]),
      );
      expect(phone.outbox()).toHaveLength(0);
    },
  );

  it("rejects delayed bootstrap from A after switching to B and resumes each owner's uploads", async () => {
    await seedExistingAccount(ALICE, "kg");
    await seedExistingAccount(BOB);
    const localA = await seedOfflineData();
    await phone.connect();
    phone.subscriptionOrder = "after-ack";
    const heldA = phone.holdNextBootstrap();
    await phone.signIn(ALICE);
    await heldA.requested;
    await phone.tick();
    expect(phone.calls).toHaveLength(0);
    await phone.signOut();
    await phone.continueOffline();
    await phone.edit((local) => local.saveNote("bench", "B private guest cue"));
    const heldB = phone.holdNextBootstrap();
    await phone.signIn(BOB);
    await heldB.requested;
    await act(async () => heldA.release());
    await phone.window(5_000);
    expect(phone.bootstrap.ownerWorkosId).toBe(ALICE);
    expect(phone.local.owner).toBe(BOB);
    expect(phone.calls).toHaveLength(0);
    expect(
      phone.sql.prepare("SELECT COUNT(*) AS count FROM local_templates").get()
        .count,
    ).toBe(0);
    expect((await phone.notes(["bench"])).bench).toBe("B private guest cue");

    await act(async () => heldB.release());
    await phone.settle();
    expect((await phone.records(BOB)).exerciseNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exerciseSlug: "bench",
          notes: "B private guest cue",
        }),
      ]),
    );
    expect((await phone.records(BOB)).workoutSessions).toHaveLength(1);
    expect((await phone.records(ALICE)).workoutSessions).toHaveLength(1);
    await phone.signOut();
    await phone.signIn(ALICE);
    await phone.settle();
    expect(
      (await phone.records(ALICE)).workoutSessions.some(
        (row) => row.clientId === localA.sessionId,
      ),
    ).toBe(true);
    expect((await phone.records(BOB)).workoutSessions).toHaveLength(1);
  });

  it("restores trusted template links on a fresh device through a lost reply and restart", async () => {
    const local = await seedOfflineData();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const before = await phone.records(ALICE);
    const original = before.workoutSessions.find(
      (row) => row.clientId === local.sessionId,
    );
    expect(original.templateId).toBe(before.workoutTemplates[0]._id);
    const backup = await phone.local.createBackup();
    const accountFile = join(phone.directory, phone.databaseName);
    await phone.unmount();
    for (const { sql } of phone.databases.values()) sql.close();
    phone.databases.clear();
    renameSync(accountFile, `${accountFile}.old`);
    await phone.reopen();
    await phone.connect();
    await phone.settle();
    expect(
      phone.sql.prepare("SELECT COUNT(*) AS count FROM local_sessions").get()
        .count,
    ).toBe(0);
    phone.faults.push({ name: "pushSession", loseResponse: true });
    await phone.edit((data) => data.restoreBackup(backup));
    const pending = phone.outbox().find((row) => row.entity_type === "session");
    expect(JSON.parse(pending.payload_json).remoteTemplateId).toBe(
      original.templateId,
    );
    expect((await phone.workout(local.sessionId)).remoteTemplateId).toBe(
      original.templateId,
    );
    await phone.tick();
    expect(
      phone.calls.find((call) => call.operationId === pending.operation_id)
        .committed,
    ).toBe(true);
    await phone.offline();
    await phone.reopen();
    expect(
      phone.outbox().find((row) => row.entity_type === "session").operation_id,
    ).toBe(pending.operation_id);
    await phone.connect();
    await phone.settle();
    const after = await phone.records(ALICE);
    expect(after.workoutSessions).toHaveLength(1);
    expect(after.workoutSessions[0]).toMatchObject({
      _id: original._id,
      templateId: original.templateId,
    });
    expect((await phone.workout(local.sessionId)).remoteTemplateId).toBe(
      original.templateId,
    );
    expect(phone.outbox()).toHaveLength(0);
  });

  it("remaps a new guest child to its reused account template after mixed-unit conversion, retries and restart", async () => {
    await seedExistingAccount(ALICE, "kg");
    const originalLocal = await seedOfflineData();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const original = await phone.records(ALICE);
    const template = original.workoutTemplates.find(
      (row) => row.name === "Offline push",
    );
    const backup = await phone.local.createBackup();
    await phone.signOut();
    await phone.offline();
    await phone.continueOffline();
    await phone.edit((local) => local.setGeneralPreferences({ unit: "lb" }));
    await phone.edit((local) => local.restoreBackup(backup));
    const sessionId = await phone.edit((local) =>
      local.startFromTemplate(originalLocal.templateId),
    );
    const workout = await phone.workout(sessionId);
    await phone.edit((local) =>
      local.updateSet(workout.exercises[0].sets[0]._id, {
        weight: 150,
        reps: 6,
        completed: true,
      }),
    );
    await phone.edit((local) => local.finish(sessionId));
    const operation = phone
      .outbox()
      .find(
        (row) => row.entity_type === "session" && row.entity_id === sessionId,
      );
    expect(JSON.parse(operation.payload_json).remoteTemplateId).toBeNull();
    await phone.reopen();
    await phone.connect();
    phone.faults.push({ name: "pushSession", loseResponse: true });
    await phone.signIn(ALICE);
    const transferred = phone
      .outbox()
      .find(
        (row) => row.entity_type === "session" && row.entity_id === sessionId,
      );
    expect(transferred.operation_id).toBe(operation.operation_id);
    expect(JSON.parse(transferred.payload_json)).toMatchObject({
      remoteTemplateId: template._id,
      exercises: [
        expect.objectContaining({
          sets: [
            expect.objectContaining({ weight: convertWeight(150, "lb", "kg") }),
          ],
        }),
        expect.anything(),
      ],
    });
    expect((await phone.workout(sessionId)).remoteTemplateId).toBe(
      template._id,
    );
    await phone.tick();
    await phone.offline();
    await phone.reopen();
    await phone.connect();
    await phone.settle();
    const records = await phone.records(ALICE);
    expect(records.workoutTemplates).toHaveLength(
      original.workoutTemplates.length,
    );
    expect(records.workoutSessions).toHaveLength(
      original.workoutSessions.length + 1,
    );
    expect(records.workoutSessions).toContainEqual(
      original.workoutSessions.find(
        (row) => row.clientId === originalLocal.sessionId,
      ),
    );
    const session = records.workoutSessions.find(
      (row) => row.clientId === sessionId,
    );
    expect(session.templateId).toBe(template._id);
    const exercise = records.sessionExercises.find(
      (row) => row.sessionId === session._id && row.exerciseSlug === "bench",
    );
    expect(
      records.sets.find((row) => row.sessionExerciseId === exercise._id).weight,
    ).toBe(convertWeight(150, "lb", "kg"));
    expect((await phone.workout(sessionId)).remoteTemplateId).toBe(
      template._id,
    );
    expect(phone.outbox()).toHaveLength(0);
  });

  it.each([
    "pushPlace",
    "pushMachine",
    "pushCustomExercise",
    "pushPreferences",
    "pushExerciseNote",
    "pushTemplate",
    "pushSession",
    "deleteSession",
  ])(
    "the real %s handler rejects a payload scoped to another account",
    async (name) => {
      const before = await seedExistingAccount(BOB);
      const local = await seedOfflineData();
      const payload = (type) =>
        JSON.parse(
          phone.outbox().find((row) => row.entity_type === type).payload_json,
        );
      const template = payload("template");
      const data = {
        pushPlace: { place: payload("place") },
        pushMachine: { machine: payload("machine") },
        pushCustomExercise: { exercise: payload("custom_exercise") },
        pushPreferences: { preferences: payload("preferences") },
        pushExerciseNote: { note: { slug: "bench", notes: "A private cue" } },
        pushTemplate: {
          template: {
            remoteId: null,
            name: template.name,
            exercises: template.exercises,
          },
        },
        pushSession: { session: payload("session") },
        deleteSession: {
          session: {
            clientId: local.sessionId,
            remoteId: null,
            externalProvider: null,
            externalId: null,
          },
        },
      };
      await expect(
        phone.as(BOB).mutation(api.routes.ios.sync[name], {
          ownerWorkosId: ALICE,
          operationId: `wrong-owner-${name}`,
          deviceId: "another-device",
          ...data[name],
        }),
      ).rejects.toThrow("belongs to another account");
      expect(await phone.records(BOB)).toEqual(before);
    },
  );

  it("recovers cloud alternatives through backups and restore, while ignoring an older cloud response after acknowledgment", async () => {
    await seedExistingAccount();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.offline();
    phone.sql
      .prepare("UPDATE local_exercise_notes SET notes = ? WHERE slug = 'ohp'")
      .run("Phone legacy cue");
    await phone.connect();
    await phone.settle();
    const alternatives = await listNoteAlternatives(phone.db);
    const cloud = alternatives.find(
      (version) => version.notes === "Existing cloud cue",
    );
    expect(cloud).toMatchObject({ slug: "ohp" });
    const backup = await phone.local.createBackup();
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    expect(parsed.snapshot.noteAlternatives).toContainEqual(cloud);
    const restored = phone.database("restored-backup.db").db;
    await migrateLocalDatabase(restored);
    await restoreLocalBackup(restored, parsed.snapshot);
    expect(await listNoteAlternatives(restored)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "ohp", notes: "Existing cloud cue" }),
      ]),
    );
    const older = await phone.as(ALICE).query(api.routes.ios.bootstrap.get, {});
    await phone.signOut();
    await phone.signIn(BOB);
    await phone.settle();
    expect(await listNoteAlternatives(phone.db)).toHaveLength(0);
    await phone.signOut();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.edit((local) => local.restoreNoteVersion(cloud));
    await phone.settle();
    expect((await phone.notes(["ohp"])).ohp).toBe("Existing cloud cue");
    expect(await listNoteAlternatives(phone.db)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ notes: "Phone legacy cue" }),
      ]),
    );
    await act(async () => {
      phone.bootstrap = older;
      phone.notify();
    });
    await phone.tick();
    expect((await phone.notes(["ohp"])).ohp).toBe("Existing cloud cue");
    expect(phone.outbox()).toHaveLength(0);
  });

  it("a cleared note keeps its revision so an older subscription cannot resurrect it", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.edit((local) => local.saveNote("bench", "Before clearing"));
    await phone.settle();
    const older = await phone.as(ALICE).query(api.routes.ios.bootstrap.get, {});
    await phone.edit((local) => local.saveNote("bench", ""));
    await phone.settle();
    await act(async () => {
      phone.bootstrap = older;
      phone.notify();
    });
    await phone.tick();
    expect((await phone.notes(["bench"])).bench).toBeUndefined();
    expect(
      phone.sql
        .prepare("SELECT notes FROM local_exercise_notes WHERE slug = 'bench'")
        .get().notes,
    ).toBe("");
    await phone.as(ALICE).mutation(api.routes.ios.sync.pushExerciseNote, {
      operationId: "fresh-after-clear",
      deviceId: "other-device",
      note: { slug: "bench", notes: "New cloud revision" },
    });
    await act(async () => phone.pull());
    await phone.tick();
    expect((await phone.notes(["bench"])).bench).toBe("New cloud revision");
  });

  it("exports an old version-7 recovery file without migrating or clearing the retained source", async () => {
    await seedOfflineData();
    phone.sql.exec(
      "ALTER TABLE local_sessions DROP COLUMN input_mode; ALTER TABLE local_sessions DROP COLUMN note_body; ALTER TABLE local_sessions DROP COLUMN note_unit; ALTER TABLE local_preferences DROP COLUMN auto_start_watch_workout; PRAGMA user_version = 7;",
    );
    await moveCurrentDatabaseToLegacy(false);
    await phone.reopen();
    const legacy = phone.database(LEGACY_DATABASE).sql;
    expect(legacy.prepare("PRAGMA user_version").get().user_version).toBe(7);
    const backup = await phone.local.legacyBackup();
    expect(backup.sessions).toHaveLength(1);
    expect(backup.sessions[0].inputMode).toBe("list");
    expect(legacy.prepare("PRAGMA user_version").get().user_version).toBe(7);
    expect(
      legacy.prepare("SELECT COUNT(*) AS count FROM local_sync_outbox").get()
        .count,
    ).toBeGreaterThan(0);
  });

  it("a returning account keeps a newly merged guest note active and its previous text recoverable", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.edit((local) => local.saveNote("bench", "Earlier account cue"));
    await phone.settle();
    await phone.signOut();
    await phone.offline();
    await phone.continueOffline();
    await phone.edit((local) => local.saveNote("bench", "New guest cue"));
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    expect((await phone.notes(["bench"])).bench).toBe("New guest cue");
    expect((await phone.records(ALICE)).exerciseNotes).toMatchObject([
      { notes: "New guest cue" },
    ]);
    expect(await listNoteAlternatives(phone.db)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "bench",
          notes: "Earlier account cue",
        }),
      ]),
    );
  });

  it.each([
    ["lb", "kg"],
    ["kg", "lb"],
  ])(
    "converts %s guest gym/machine memories into a populated %s account before uploads",
    async (guestUnit, accountUnit) => {
      await seedExistingAccount(ALICE, accountUnit);
      await phone.connect();
      await phone.signIn(ALICE);
      await phone.settle();
      await phone.signOut();
      await phone.offline();
      await seedOfflineData(guestUnit);
      await phone.connect();
      await phone.signIn(ALICE);
      const memory = phone.sql
        .prepare(
          "SELECT sets_json FROM local_exercise_place_weights WHERE exercise_slug = 'bench'",
        )
        .get();
      expect(JSON.parse(memory.sets_json)[0].weight).toBe(
        convertWeight(150, guestUnit, accountUnit),
      );
      await phone.settle();
      expect(
        (await phone.records(ALICE)).sets.find((row) => row.reps === 6).weight,
      ).toBe(convertWeight(150, guestUnit, accountUnit));
    },
  );

  it("converts an imported memory after its gym and machine alias existing account identities", async () => {
    await seedExistingAccount(ALICE, "kg");
    await phone.connect();
    await phone.signIn(ALICE);
    const place = await phone.edit((local) => local.createPlace("Shared gym"));
    const machine = await phone.edit((local) =>
      local.createMachine({
        placeId: place._id,
        exerciseSlug: "bench",
        name: "Bench",
      }),
    );
    await phone.settle();
    const targetPlace = phone.sql
      .prepare("SELECT * FROM local_places WHERE id = ?")
      .get(place._id);
    const targetMachine = phone.sql
      .prepare("SELECT * FROM local_machines WHERE id = ?")
      .get(machine._id);
    await phone.signOut();
    await phone.offline();
    await phone.continueOffline();
    phone.sql
      .prepare(
        "INSERT INTO local_places (id, remote_id, name, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run("source-place", targetPlace.remote_id, "Shared gym", 1);
    phone.sql
      .prepare(
        "INSERT INTO local_machines (id, remote_id, place_id, exercise_slug, name, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "source-machine",
        targetMachine.remote_id,
        "source-place",
        "bench",
        "Bench",
        1,
      );
    phone.sql
      .prepare(
        "INSERT INTO local_exercise_place_weights VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "source-place",
        "bench",
        "source-machine",
        JSON.stringify([{ weight: 150, reps: 6 }]),
        1,
      );
    await phone.connect();
    await phone.signIn(ALICE);
    const memory = phone.sql
      .prepare(
        "SELECT * FROM local_exercise_place_weights WHERE exercise_slug = 'bench'",
      )
      .get();
    expect(memory).toMatchObject({
      place_id: place._id,
      machine_key: machine._id,
    });
    expect(JSON.parse(memory.sets_json)).toEqual([
      { weight: convertWeight(150, "lb", "kg"), reps: 6 },
    ]);
    await phone.settle();
  });

  it.each([ALICE, BOB])(
    "restores a synced backup while signed out and merges it safely into %s",
    async (destination) => {
      await seedOfflineData();
      await phone.connect();
      await phone.signIn(ALICE);
      await phone.settle();
      const custom = (await phone.records(ALICE)).customExercises[0];
      await phone.edit(() =>
        keepNoteAlternative(
          phone.db,
          `custom:${custom._id}`,
          "Recoverable custom cue",
        ),
      );
      const backup = parseBackup(
        serializeBackup(await phone.local.createBackup()),
      ).snapshot;
      const original = await phone.records(ALICE);
      await phone.signOut();
      await phone.offline();
      await phone.continueOffline();
      const restored = await phone.edit((local) => local.restoreBackup(backup));
      expect(restored.sessionsAdded).toBe(1);
      expect(
        (await phone.edit((local) => local.restoreBackup(backup)))
          .sessionsAdded,
      ).toBe(0);
      await phone.reopen();
      await phone.connect();
      phone.faults.push({ name: "pushSession", loseResponse: true });
      await phone.signIn(destination);
      await phone.settle();
      await phone.reopen();
      await phone.connect();
      await phone.settle();
      const result = await phone.records(destination);
      expect(result.workoutSessions).toHaveLength(1);
      expect(result.workoutTemplates).toHaveLength(1);
      expect(result.customExercises).toHaveLength(1);
      expect(result.sets).toHaveLength(2);
      expect(result.sessionExercises.map((row) => row.exerciseSlug)).toContain(
        `custom:${result.customExercises[0]._id}`,
      );
      expect(result.exerciseNotes.map((row) => row.exerciseSlug)).toContain(
        `custom:${result.customExercises[0]._id}`,
      );
      const alternative = (await listNoteAlternatives(phone.db)).find(
        (version) => version.notes === "Recoverable custom cue",
      );
      expect(alternative.slug).toBe(`custom:${result.customExercises[0]._id}`);
      await phone.edit((local) => local.restoreNoteVersion(alternative));
      await phone.settle();
      expect(
        (await phone.records(destination)).exerciseNotes.find(
          (row) => row.exerciseSlug === alternative.slug,
        ).notes,
      ).toBe("Recoverable custom cue");
      expect(phone.outbox()).toHaveLength(0);
      if (destination === BOB)
        expect(await phone.records(ALICE)).toEqual(original);
    },
  );

  it("restores A's synced backup directly into signed-in B without touching A", async () => {
    await seedOfflineData();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const backup = await phone.local.createBackup();
    const original = await phone.records(ALICE);
    await seedExistingAccount(BOB, "kg");
    await phone.signOut();
    await phone.signIn(BOB);
    await phone.settle();
    await phone.offline();
    await phone.edit((local) => local.restoreBackup(backup));
    await phone.reopen();
    await phone.connect();
    await phone.settle();
    const result = await phone.records(BOB);
    expect(result.workoutSessions).toHaveLength(2);
    expect(result.workoutTemplates).toHaveLength(2);
    expect(result.customExercises).toHaveLength(1);
    expect(result.sets.find((set) => set.reps === 6).weight).toBe(
      convertWeight(150, "lb", "kg"),
    );
    const customSlug = `custom:${result.customExercises[0]._id}`;
    expect(result.sessionExercises.map((row) => row.exerciseSlug)).toContain(
      customSlug,
    );
    expect(result.exerciseNotes.map((row) => row.exerciseSlug)).toContain(
      customSlug,
    );
    expect(phone.outbox()).toHaveLength(0);
    expect(await phone.records(ALICE)).toEqual(original);
  });

  it("rolls back restored data if saving its upload intent fails, then restores safely after restart", async () => {
    await seedOfflineData();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const backup = await phone.local.createBackup();
    await phone.signOut();
    await phone.offline();
    await phone.continueOffline();
    const run = phone.db.runAsync;
    let rowsBeforeQueueFailure = 0;
    phone.db.runAsync = async (query, ...args) => {
      if (
        query.includes("INSERT INTO local_sync_outbox") &&
        args[0] === "place"
      ) {
        rowsBeforeQueueFailure = phone.sql
          .prepare("SELECT COUNT(*) AS count FROM local_sessions")
          .get().count;
        throw new Error("Interrupted restore queue write");
      }
      return run(query, ...args);
    };
    try {
      await expect(
        phone.edit((local) => local.restoreBackup(backup)),
      ).rejects.toThrow("Interrupted restore queue write");
    } finally {
      phone.db.runAsync = run;
    }
    expect(rowsBeforeQueueFailure).toBe(1);
    expect(
      phone.sql.prepare("SELECT COUNT(*) AS count FROM local_sessions").get()
        .count,
    ).toBe(0);
    expect(
      phone.sql.prepare("SELECT COUNT(*) AS count FROM local_templates").get()
        .count,
    ).toBe(0);
    expect(phone.outbox()).toHaveLength(0);
    await phone.reopen();
    await phone.edit((local) => local.restoreBackup(backup));
    await phone.connect();
    await phone.signIn(BOB);
    await phone.settle();
    const result = await phone.records(BOB);
    expect(result.workoutSessions).toHaveLength(1);
    expect(result.workoutTemplates).toHaveLength(1);
    expect(result.customExercises).toHaveLength(1);
    expect(result.sets).toHaveLength(2);
    expect(phone.outbox()).toHaveLength(0);
  });

  it("converts a quarantined guest template without dropping it or retrying it automatically", async () => {
    await seedExistingAccount(ALICE, "kg");
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.signOut();
    await phone.offline();
    await phone.edit((local) => local.setGeneralPreferences({ unit: "lb" }));
    const id = await phone.edit((local) =>
      local.saveTemplate({
        name: "Quarantined guest",
        exercises: [{ slug: "bench", sets: [{ weight: 135, reps: 5 }] }],
      }),
    );
    phone.sql
      .prepare(
        "UPDATE local_sync_outbox SET entity_type = 'template_quarantined' WHERE entity_type = 'template'",
      )
      .run();
    const operation = phone
      .outbox()
      .find((row) => row.entity_type === "template_quarantined").operation_id;
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.window(125_000);
    expect(phone.outbox()).toMatchObject([
      { entity_type: "template_quarantined", operation_id: operation },
    ]);
    expect(
      JSON.parse(phone.outbox()[0].payload_json).exercises[0].sets[0].weight,
    ).toBe(convertWeight(135, "lb", "kg"));
    expect(
      JSON.parse(
        phone.sql
          .prepare(
            "SELECT sets_json FROM local_template_exercises WHERE template_id = ?",
          )
          .get(id).sets_json,
      )[0].weight,
    ).toBe(convertWeight(135, "lb", "kg"));
    expect((await phone.records(ALICE)).workoutTemplates).toHaveLength(1);
  });

  it.each(["target-write", "source-cleanup"])(
    "resumes an interrupted guest transfer at %s without giving its data to the next account",
    async (phase) => {
      const local = await seedOfflineData();
      const pending = phone.outbox();
      const source = phone.db;
      const target = phone.database(accountDatabaseName(ALICE)).db;
      const failingDb = phase === "target-write" ? target : source;
      const original = failingDb.runAsync;
      let failed = false;
      failingDb.runAsync = async (sql, ...args) => {
        if (
          !failed &&
          (phase === "target-write"
            ? sql.startsWith("INSERT OR IGNORE INTO local_sets")
            : sql === "DELETE FROM local_sets")
        ) {
          failed = true;
          throw new Error("Simulated power loss");
        }
        return original(sql, ...args);
      };
      await expect(prepareScopedDatabase(target, ALICE)).rejects.toThrow(
        "Simulated power loss",
      );
      failingDb.runAsync = original;
      expect(phone.outbox()).toEqual(pending);
      await phone.reopen();
      expect(phone.outbox()).toHaveLength(0);
      await phone.connect();
      await phone.signIn(BOB);
      await phone.settle();
      expect((await phone.records(BOB)).workoutSessions).toHaveLength(0);
      await phone.signOut();
      await phone.signIn(ALICE);
      await phone.settle();
      await assertOfflineDataMerged(local);
    },
  );

  it("retains unowned legacy data without assigning A's pending rows to restored account B", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.offline();
    const session = await phone.edit((local) => local.startNote());
    await phone.edit((local) =>
      local.saveWorkoutNote(session, "A private legacy workout"),
    );
    await phone.edit((local) =>
      local.saveNote("bench", "A private legacy cue"),
    );
    const pending = phone.outbox();
    await moveCurrentDatabaseToLegacy(false);
    phone.keys.set(SESSION_KEY, phone.token(BOB).session);
    phone.keys.set(USER_KEY, JSON.stringify(phone.token(BOB).user));
    await phone.reopen();
    expect(phone.outbox()).toHaveLength(0);
    expect(
      phone.sql
        .prepare(
          "SELECT value FROM local_metadata WHERE key = 'recovery:legacy-available'",
        )
        .get().value,
    ).toBe("1");
    await phone.connect();
    await phone.settle();
    const b = await phone.records(BOB);
    expect(b.workoutSessions).toHaveLength(0);
    expect(b.exerciseNotes).toHaveLength(0);
    const legacy = phone.database(LEGACY_DATABASE).sql;
    expect(
      legacy
        .prepare("SELECT note_body FROM local_sessions WHERE id = ?")
        .get(session).note_body,
    ).toBe("A private legacy workout");
    expect(
      legacy
        .prepare(
          "SELECT operation_id FROM local_sync_outbox ORDER BY operation_id",
        )
        .all()
        .map((row) => row.operation_id),
    ).toEqual(pending.map((row) => row.operation_id).sort());
  });

  it("migrates an explicitly owned legacy database into its owner even when a different account is restored", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.offline();
    await phone.edit((local) =>
      local.saveNote("bench", "A stamped legacy cue"),
    );
    await moveCurrentDatabaseToLegacy(true);
    phone.keys.set(SESSION_KEY, phone.token(BOB).session);
    phone.keys.set(USER_KEY, JSON.stringify(phone.token(BOB).user));
    await phone.reopen();
    await phone.connect();
    await phone.settle();
    expect((await phone.records(BOB)).exerciseNotes).toHaveLength(0);
    await phone.signOut();
    await phone.signIn(ALICE);
    await phone.settle();
    expect((await phone.notes(["bench"])).bench).toBe("A stamped legacy cue");
    expect((await phone.records(ALICE)).exerciseNotes).toMatchObject([
      { notes: "A stamped legacy cue" },
    ]);
    expect(
      phone
        .database(LEGACY_DATABASE)
        .sql.prepare(
          "SELECT notes FROM local_exercise_notes WHERE slug = 'bench'",
        )
        .get().notes,
    ).toBe("A stamped legacy cue");
  });

  it("rejects an A upload delivered under B's authentication and retries it only after A returns", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const held = phone.holdNextRequest("pushExerciseNote");
    await phone.edit((local) => local.saveNote("bench", "A in-flight cue"));
    await phone.tick();
    const call = await held.started;
    await phone.signOut();
    await phone.signIn(BOB);
    await act(async () => held.release());
    await phone.tick();
    await phone.settle();
    expect(call.dispatchedSubject).toBe(BOB);
    expect(call.committed).toBe(false);
    expect((await phone.records(BOB)).exerciseNotes).toHaveLength(0);
    expect((await phone.records(ALICE)).exerciseNotes).toHaveLength(0);
    await phone.signOut();
    await phone.signIn(ALICE);
    await phone.settle();
    expect((await phone.records(ALICE)).exerciseNotes).toMatchObject([
      { notes: "A in-flight cue" },
    ]);
    expect((await phone.records(BOB)).exerciseNotes).toHaveLength(0);
  });

  it.each([
    ["lb", "kg"],
    ["kg", "lb"],
  ])(
    "preserves weight meaning when a %s guest merges into an existing %s account",
    async (guestUnit, accountUnit) => {
      const original = await seedExistingAccount(ALICE, accountUnit);
      const local = await seedOfflineData(guestUnit);
      await phone.connect();
      await phone.signIn(ALICE);
      await phone.settle();
      const merged = await phone.records(ALICE);
      const unit = merged.user.unit;
      const guestExercise = merged.sessionExercises.find(
        (row) => row.exerciseSlug === "bench",
      );
      const guestSet = merged.sets.find(
        (row) => row.sessionExerciseId === guestExercise._id,
      );
      expect
        .soft(
          guestSet.weight,
          "Guest workout must retain its original physical weight",
        )
        .toBe(convertWeight(150, guestUnit, unit));
      expect
        .soft(
          (await phone.workout(local.sessionId)).exercises[0].sets[0].weight,
          "Local workout must agree with the current display unit",
        )
        .toBe(convertWeight(150, guestUnit, unit));
      const existing = merged.templateExercises.find(
        (row) => row.templateId === original.workoutTemplates[0]._id,
      );
      expect
        .soft(
          existing.sets[0].weight,
          "Existing cloud data must retain its original physical weight",
        )
        .toBe(convertWeight(75, accountUnit, unit));
      const guestTemplate = merged.templateExercises.find(
        (row) => row.exerciseSlug === "bench",
      );
      expect
        .soft(
          guestTemplate.sets[0].weight,
          "Guest template presets must retain their original physical weight",
        )
        .toBe(convertWeight(135, guestUnit, unit));
      expect(phone.outbox()).toHaveLength(0);
    },
  );

  it("preserves different cloud and guest templates when their names collide", async () => {
    const seed = await seedExistingAccount();
    await phone.as(ALICE).mutation(api.routes.templates.mutations.update, {
      templateId: seed.workoutTemplates[0]._id,
      name: "Offline push",
      exercises: [{ slug: "ohp", sets: [{ weight: 75, reps: 5 }] }],
    });
    const original = await phone.records(ALICE);
    await seedOfflineData();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const merged = await phone.records(ALICE);
    expect
      .soft(
        merged.workoutTemplates.some(
          (row) => row._id === original.workoutTemplates[0]._id,
        ),
        "The existing cloud template identity must remain valid",
      )
      .toBe(true);
    expect
      .soft(
        merged.templateExercises,
        "The existing cloud exercise and weights must remain intact",
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            templateId: original.workoutTemplates[0]._id,
            exerciseSlug: "ohp",
            sets: [{ weight: 75, reps: 5 }],
          }),
        ]),
      );
    expect.soft(merged.workoutTemplates).toHaveLength(2);
  });

  it("merges a same-name cloud place without blocking the remaining offline uploads", async () => {
    await seedExistingAccount();
    await phone.as(ALICE).mutation(api.routes.ios.sync.pushPlace, {
      operationId: "cloud-place-collision",
      deviceId: "another-device",
      place: {
        clientId: "cloud-place",
        name: "Offline gym",
        starred: true,
        archived: false,
      },
    });
    const original = await phone.records(ALICE);
    const local = await seedOfflineData();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    const merged = await phone.records(ALICE);
    expect(merged.places).toHaveLength(1);
    expect(merged.places[0]._id).toBe(original.places[0]._id);
    expect(
      merged.workoutSessions.find((row) => row.clientId === local.sessionId)
        .placeId,
    ).toBe(original.places[0]._id);
    expect(
      merged.machines.every((row) => row.placeId === original.places[0]._id),
    ).toBe(true);
    expect(merged.workoutSessions).toHaveLength(2);
    expect(merged.workoutTemplates).toHaveLength(2);
  });

  it("must not upload account A's queued edits to account B after sign-out/sign-in", async () => {
    await seedExistingAccount(ALICE);
    await seedExistingAccount(BOB);
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.offline();
    await phone.edit((local) => local.setGeneralPreferences({ unit: "kg" }));
    await phone.edit((local) =>
      local.saveNote("bench", "Account A private offline cue"),
    );
    await phone.signOut();
    await phone.connect();
    await phone.signIn(BOB);
    await phone.tick(61_000);
    const b = await phone.records(BOB);
    expect
      .soft(b.user.unit, "Account B must retain its own preferences")
      .toBe("lb");
    expect
      .soft(
        b.exerciseNotes.some(
          (row) => row.notes === "Account A private offline cue",
        ),
        "Account A notes must never enter account B",
      )
      .toBe(false);
    // Switching back must still allow A to recover and sync its own queued edits.
    await phone.signOut();
    await phone.signIn(ALICE);
    await phone.settle();
    expect
      .soft(
        (await phone.records(ALICE)).user.unit,
        "A's unsynced setting must remain recoverable",
      )
      .toBe("kg");
  });

  it("preserves a legacy offline note without an outbox entry during same-account upgrade/reconnect", async () => {
    await seedExistingAccount();
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.settle();
    await phone.offline();
    // Storage produced by pre-outbox releases, not a new-app save operation.
    phone.sql
      .prepare(
        "UPDATE local_exercise_notes SET notes = ?, updated_at = ? WHERE slug = 'ohp'",
      )
      .run("Newer offline cue from an older build", Date.now());
    expect(phone.outbox()).toHaveLength(0);
    await phone.reopen();
    expect((await phone.notes(["ohp"])).ohp).toBe(
      "Newer offline cue from an older build",
    );
    await phone.connect();
    await phone.settle();
    expect(
      (await phone.notes(["ohp"])).ohp,
      "Reconnecting must not destroy a legacy local edit",
    ).toBe("Newer offline cue from an older build");
  });
});
