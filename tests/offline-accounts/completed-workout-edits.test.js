import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../backend/_generated/api";
import {
  PhoneScenario,
  installTestEnvironment,
  restoreTestEnvironment,
} from "./harness";
import { migrateLocalDatabase } from "@/data/local/migrations";
import {
  adoptRemoteCompletedListWorkout,
  attachExportedHealthUuid,
  getPendingSessionSync,
} from "@/data/local/repository";

const ALICE = "user_test_alice";
let phone;
beforeEach(async () => {
  installTestEnvironment();
  phone = await new PhoneScenario().open();
  await phone.connect();
  await phone.signIn(ALICE);
  await phone.settle();
});
afterEach(async () => {
  await phone?.close();
  restoreTestEnvironment();
});

async function seedWebWorkout({ newer = false } = {}) {
  const { user } = await phone.records(ALICE);
  return phone.cloud.run(async (ctx) => {
    const templateId = await ctx.db.insert("workoutTemplates", {
      userId: user._id,
      name: "Web push",
      createdAt: 1,
      updatedAt: 1,
    });
    const placeId = await ctx.db.insert("places", {
      userId: user._id,
      name: "Web gym",
      starred: false,
      archived: false,
    });
    const completedAt = Date.now() - 7 * 86_400_000;
    const insert = async (time, weight) => {
      const sessionId = await ctx.db.insert("workoutSessions", {
        userId: user._id,
        templateId,
        templateName: "Web push",
        placeId,
        placeName: "Web gym",
        status: "completed",
        sessionKind: "tracked",
        inputMode: "list",
        startedAt: time - 1000,
        completedAt: time,
      });
      const exerciseId = await ctx.db.insert("sessionExercises", {
        sessionId,
        exerciseSlug: "bench",
        orderIndex: 0,
        restSeconds: 75,
        notes: "Original session note",
      });
      const setId = await ctx.db.insert("sets", {
        sessionExerciseId: exerciseId,
        orderIndex: 0,
        weight,
        reps: 5,
        targetWeight: weight,
        targetReps: 5,
        completed: true,
        completedAt: time,
      });
      return { sessionId, exerciseId, setId };
    };
    const original = await insert(completedAt, 135);
    const later = newer ? await insert(completedAt + 86_400_000, 225) : null;
    await ctx.db.insert("exercisePlaceWeights", {
      userId: user._id,
      placeId,
      exerciseSlug: "bench",
      machineKey: "default",
      sets: [{ weight: newer ? 225 : 135, reps: 5 }],
      updatedAt: completedAt + 86_400_000,
    });
    return { ...original, templateId, placeId, completedAt, later };
  });
}

async function detail(sessionId) {
  return phone.as(ALICE).query(api.routes.workouts.queries.get, { sessionId });
}
async function memory(placeId) {
  return phone.cloud.run((ctx) =>
    ctx.db
      .query("exercisePlaceWeights")
      .withIndex("by_place_slug_machine", (q) =>
        q
          .eq("placeId", placeId)
          .eq("exerciseSlug", "bench")
          .eq("machineKey", "default"),
      )
      .unique(),
  );
}

describe("completed workout preservation contract", () => {
  it("updates Share's subscribed outbox state after an upload fails before commit and recovers after restart", async () => {
    await phone.offline();
    const sessionId = await phone.edit((local) => local.startBlank());
    await phone.edit((local) =>
      local.addExercise(sessionId, "bench", [{ weight: 135, reps: 5 }]),
    );
    await phone.edit((local) => local.finish(sessionId));
    phone.shareSessionId = sessionId;
    await phone.reopen();
    expect(phone.shareAttempt).toBe(0);
    const operationId = phone.outbox()[0].operation_id;
    phone.faults.push({
      name: "pushSession",
      beforeCommit: async () => {
        throw new TypeError("Connection interrupted");
      },
    });
    await phone.connect();
    await phone.tick();
    expect(phone.shareAttempt).toBe(1);
    expect(phone.outbox()[0].operation_id).toBe(operationId);
    expect((await phone.records(ALICE)).workoutSessions).toHaveLength(0);
    await phone.offline();
    await phone.reopen();
    expect(phone.shareAttempt).toBe(1);
    await phone.connect();
    await phone.settle();
    expect(phone.shareAttempt).toBe(null);
    const records = await phone.records(ALICE);
    expect(records.workoutSessions).toHaveLength(1);
    expect(records.sessionExercises).toHaveLength(1);
    expect(records.sets).toHaveLength(1);
    expect(
      await phone
        .as(ALICE)
        .query(api.routes.social.queries.syncedSession, { localId: sessionId }),
    ).toBe(records.workoutSessions[0]._id);
  });

  it.each([
    ["in_progress", "before-ack"],
    ["in_progress", "after-ack"],
    ["abandoned", "before-ack"],
    ["abandoned", "after-ack"],
  ])(
    "retries an offline finish across restart without overriding a newer discard (server: %s, %s)",
    async (serverStatus, subscriptionOrder) => {
      phone.subscriptionOrder = subscriptionOrder;
      const seeded = await seedWebWorkout();
      const original = await detail(seeded.sessionId);
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
      await phone.offline();
      await phone.edit((local) =>
        local.updateSet(seeded.setId, { weight: 155 }),
      );
      const queued = await getPendingSessionSync(phone.db);
      const newerRevision = queued.snapshot.updatedAt + 60_000;
      await phone.cloud.run((ctx) =>
        ctx.db.patch(seeded.sessionId, {
          status: serverStatus,
          clientUpdatedAt: newerRevision,
        }),
      );
      await phone.reopen();
      phone.faults.push({ name: "pushSession", loseResponse: true });
      await phone.connect();
      await phone.settle();

      const applied = serverStatus === "in_progress";
      const records = await phone.records(ALICE);
      expect(records.workoutSessions).toEqual([
        expect.objectContaining({
          _id: seeded.sessionId,
          status: applied ? "completed" : "abandoned",
          clientUpdatedAt: newerRevision,
        }),
      ]);
      expect(records.sessionExercises).toHaveLength(1);
      expect(records.sets).toEqual([
        expect.objectContaining({
          _id: seeded.setId,
          weight: applied ? 155 : 135,
        }),
      ]);
      expect(
        await phone.as(ALICE).query(api.routes.social.queries.syncedSession, {
          localId: seeded.sessionId,
        }),
      ).toBe(applied ? seeded.sessionId : null);
      expect(phone.outbox()).toEqual([]);
    },
  );

  it.each(["before-ack", "after-ack"])(
    "preserves a late second-phone Health attachment across offline list edits, restart and retry (%s)",
    async (subscriptionOrder) => {
      phone.subscriptionOrder = subscriptionOrder;
      const seeded = await seedWebWorkout();
      const original = await detail(seeded.sessionId);
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
      await phone.offline();

      // Phone A exports to Health after phone B has cached the unlinked copy.
      // Use the real SQLite attachment/outbox path and authenticated handler.
      const exporter = phone.database("health-exporter.db");
      await migrateLocalDatabase(exporter.db);
      await adoptRemoteCompletedListWorkout(exporter.db, original);
      await attachExportedHealthUuid(
        exporter.db,
        seeded.sessionId,
        "late-health-uuid",
      );
      const attachment = await getPendingSessionSync(exporter.db);
      await phone.as(ALICE).mutation(api.routes.ios.sync.pushSession, {
        operationId: attachment.operationId,
        deviceId: "health-exporter",
        session: attachment.snapshot,
      });
      await phone.tick(10);
      await phone.edit((local) =>
        local.updateSet(seeded.setId, { weight: 155 }),
      );
      expect(
        (await getPendingSessionSync(phone.db)).snapshot.externalId,
      ).toBeNull();
      await phone.reopen();
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
      phone.faults.push({ name: "pushSession", loseResponse: true });
      await phone.connect();
      await phone.settle();

      const records = await phone.records(ALICE);
      expect(records.workoutSessions).toHaveLength(1);
      expect(records.workoutSessions[0]).toMatchObject({
        _id: seeded.sessionId,
        completedAt: seeded.completedAt,
        externalProvider: "apple_health",
        externalId: "late-health-uuid",
        sourceName: attachment.snapshot.sourceName,
        durationSeconds: attachment.snapshot.durationSeconds,
        importedAt: attachment.snapshot.importedAt,
      });
      const refreshed = await detail(seeded.sessionId);
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(refreshed));
      const saved = await phone.workout(seeded.sessionId);
      expect(saved.health.externalId).toBe("late-health-uuid");
      expect(saved.exercises[0].sets[0]).toMatchObject({
        _id: seeded.setId,
        weight: 155,
      });
      expect(
        phone.sql
          .prepare(
            "SELECT health_export_pending FROM local_sessions WHERE remote_id = ?",
          )
          .get(seeded.sessionId).health_export_pending,
      ).toBe(0);
      expect(phone.outbox()).toEqual([]);
    },
  );

  it.each([
    ["reorder", "before-ack"],
    ["reorder", "after-ack"],
    ["delete-first-set", "before-ack"],
    ["delete-first-set", "after-ack"],
  ])(
    "preserves legacy child identities on the first structural edit: %s (%s)",
    async (operation, subscriptionOrder) => {
      phone.subscriptionOrder = subscriptionOrder;
      const seeded = await seedWebWorkout();
      const extra = await phone.cloud.run(async (ctx) => {
        const secondSet = await ctx.db.insert("sets", {
          sessionExerciseId: seeded.exerciseId,
          orderIndex: 1,
          weight: 145,
          reps: 6,
          targetWeight: 145,
          targetReps: 6,
          completed: true,
          completedAt: seeded.completedAt,
        });
        const secondExercise = await ctx.db.insert("sessionExercises", {
          sessionId: seeded.sessionId,
          exerciseSlug: "squat",
          orderIndex: 1,
          restSeconds: 75,
        });
        const squatSet = await ctx.db.insert("sets", {
          sessionExerciseId: secondExercise,
          orderIndex: 0,
          weight: 225,
          reps: 5,
          targetWeight: 225,
          targetReps: 5,
          completed: true,
          completedAt: seeded.completedAt,
        });
        return { secondSet, secondExercise, squatSet };
      });
      const original = await detail(seeded.sessionId);
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
      await phone.offline();
      if (operation === "reorder") {
        await phone.edit((local) => local.moveExercise(seeded.exerciseId, 1));
      } else {
        await phone.edit((local) => local.deleteSet(seeded.setId));
      }
      await phone.reopen();
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
      phone.faults.push({ name: "pushSession", loseResponse: true });
      await phone.connect();
      await phone.settle();
      const records = await phone.records(ALICE);
      expect(records.workoutSessions).toHaveLength(1);
      expect(
        records.sessionExercises.map((exercise) => exercise._id).sort(),
      ).toEqual([seeded.exerciseId, extra.secondExercise].sort());
      const expectedSetIds =
        operation === "reorder"
          ? [seeded.setId, extra.secondSet, extra.squatSet]
          : [extra.secondSet, extra.squatSet];
      expect(records.sets.map((set) => set._id).sort()).toEqual(
        expectedSetIds.sort(),
      );
      expect(
        records.sets.find((set) => set._id === extra.secondSet),
      ).toMatchObject({
        weight: 145,
        reps: 6,
        sessionExerciseId: seeded.exerciseId,
      });
      const refreshed = await detail(seeded.sessionId);
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(refreshed));
      const saved = await phone.workout(seeded.sessionId);
      expect(
        saved.exercises
          .flatMap((exercise) => exercise.sets.map((set) => set._id))
          .sort(),
      ).toEqual(expectedSetIds.sort());
      expect(saved.completedAt).toBe(seeded.completedAt);
      expect(phone.outbox()).toEqual([]);
    },
  );

  it.each(["before-ack", "after-ack"])(
    "preserves web identity, template, cleared notes and post through offline restart and lost response (%s)",
    async (subscriptionOrder) => {
      phone.subscriptionOrder = subscriptionOrder;
      const seeded = await seedWebWorkout();
      await phone.edit((local) => local.saveNote("bench", "Global cue"));
      await phone.settle();
      const postId = await phone
        .as(ALICE)
        .mutation(api.routes.social.mutations.shareWorkout, {
          sessionId: seeded.sessionId,
          caption: "Original caption",
        });
      const original = await detail(seeded.sessionId);
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
      await phone.offline();
      await phone.edit((local) =>
        local.updateSet(seeded.setId, { weight: 155 }),
      );
      await phone.edit((local) =>
        local.saveSessionExerciseNote(seeded.exerciseId, ""),
      );
      const addedSet = await phone.edit((local) =>
        local.addSet(seeded.exerciseId),
      );
      await phone.edit((local) =>
        local.updateSet(addedSet, { weight: 165, reps: 3, completed: true }),
      );
      await phone.edit((local) => local.deleteSet(seeded.setId));
      await phone.reopen();
      // Old cached detail must never rewind the durable offline aggregate.
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
      expect(await phone.workout(seeded.sessionId)).toMatchObject({
        remoteId: seeded.sessionId,
        remoteTemplateId: seeded.templateId,
        completedAt: seeded.completedAt,
        exercises: [{ notes: "", sets: [{ weight: 165, reps: 3 }] }],
      });
      expect(
        phone.sql
          .prepare(
            "SELECT health_export_pending FROM local_sessions WHERE remote_id = ?",
          )
          .get(seeded.sessionId).health_export_pending,
      ).toBe(0);
      phone.faults.push({ name: "pushSession", loseResponse: true });
      await phone.connect();
      await phone.settle();
      const records = await phone.records(ALICE);
      expect(records.workoutSessions).toHaveLength(1);
      expect(records.workoutSessions[0]).toMatchObject({
        _id: seeded.sessionId,
        templateId: seeded.templateId,
        completedAt: seeded.completedAt,
      });
      expect((await phone.workout(seeded.sessionId)).templateId).toBe(
        seeded.templateId,
      );
      expect(records.sessionExercises).toHaveLength(1);
      expect(records.sets).toMatchObject([
        { weight: 165, reps: 3, completed: true },
      ]);
      expect((await detail(seeded.sessionId)).exercises[0].notes).toBe("");
      const posts = await phone.cloud.run((ctx) =>
        ctx.db.query("activityPosts").collect(),
      );
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        _id: postId,
        caption: "Original caption",
        completedAt: seeded.completedAt,
      });
      expect(posts[0].bundle.templates[0].exercises[0].sets).toEqual([
        { weight: 165, reps: 3 },
      ]);
      expect(phone.outbox()).toEqual([]);
      expect(
        phone.calls.some(
          (call) =>
            call.name === "pushSession" && call.committed && !call.delivered,
        ),
      ).toBe(true);
    },
  );

  it("preserves local template aliases and newest equipment memory for phone and web historical edits", async () => {
    const seeded = await seedWebWorkout({ newer: true });
    await act(async () => phone.pull());
    await phone.tick();
    const original = await detail(seeded.sessionId);
    await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
    expect((await phone.workout(seeded.sessionId)).templateId).toBe(
      seeded.templateId,
    );
    await phone.offline();
    await phone.edit((local) =>
      local.saveSessionExerciseNote(seeded.exerciseId, "Old note corrected"),
    );
    await phone.edit((local) => local.updateSet(seeded.setId, { weight: 145 }));
    // The newer workout can exist only on another device: cached presets must
    // remain intact even though this phone has never adopted that session.
    const localMemory = () =>
      JSON.parse(
        phone.sql
          .prepare(
            "SELECT sets_json FROM local_exercise_place_weights WHERE place_id = ? AND exercise_slug = 'bench'",
          )
          .get(seeded.placeId).sets_json,
      );
    expect(localMemory()).toEqual([{ weight: 225, reps: 5 }]);
    await phone.connect();
    await phone.settle();
    expect((await memory(seeded.placeId)).sets).toEqual([
      { weight: 225, reps: 5 },
    ]);
    expect(localMemory()).toEqual([{ weight: 225, reps: 5 }]);
    // Exercise and note edits on web obey the same chronological rule.
    await phone.as(ALICE).mutation(api.routes.workouts.mutations.updateSet, {
      setId: seeded.setId,
      weight: 150,
    });
    await phone
      .as(ALICE)
      .mutation(api.routes.workouts.mutations.updateExerciseNotes, {
        sessionExerciseId: seeded.exerciseId,
        notes: "",
      });
    expect((await detail(seeded.sessionId)).exercises[0].notes).toBe("");
    expect((await memory(seeded.placeId)).sets).toEqual([
      { weight: 225, reps: 5 },
    ]);
    await phone.as(ALICE).mutation(api.routes.workouts.mutations.updateSet, {
      setId: seeded.later.setId,
      weight: 235,
    });
    expect((await memory(seeded.placeId)).sets).toEqual([
      { weight: 235, reps: 5 },
    ]);
  });

  it.each(["before-ack", "after-ack"])(
    "replaces a completed lift offline without losing child identity (%s)",
    async (subscriptionOrder) => {
      phone.subscriptionOrder = subscriptionOrder;
      const seeded = await seedWebWorkout();
      const postId = await phone
        .as(ALICE)
        .mutation(api.routes.social.mutations.shareWorkout, {
          sessionId: seeded.sessionId,
          caption: "Original caption",
        });
      const original = await detail(seeded.sessionId);
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
      await phone.offline();
      await phone.edit((local) =>
        local.replaceExercise(seeded.exerciseId, "squat"),
      );
      await phone.reopen();
      await phone.edit((local) => local.adoptRemoteCompletedWorkout(original));
      phone.faults.push({ name: "pushSession", loseResponse: true });
      await phone.connect();
      await phone.settle();
      const records = await phone.records(ALICE);
      expect(records.workoutSessions).toHaveLength(1);
      expect(records.workoutSessions[0]).toMatchObject({
        _id: seeded.sessionId,
        completedAt: seeded.completedAt,
      });
      expect(records.sessionExercises).toEqual([
        expect.objectContaining({
          _id: seeded.exerciseId,
          exerciseSlug: "squat",
        }),
      ]);
      expect(records.sets).toEqual([
        expect.objectContaining({
          _id: seeded.setId,
          sessionExerciseId: seeded.exerciseId,
        }),
      ]);
      expect((await detail(seeded.sessionId)).exercises[0]).toMatchObject({
        _id: seeded.exerciseId,
        slug: "squat",
      });
      const posts = await phone.cloud.run((ctx) =>
        ctx.db.query("activityPosts").collect(),
      );
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        _id: postId,
        caption: "Original caption",
        completedAt: seeded.completedAt,
      });
      expect(posts[0].bundle.templates[0].exercises[0].slug).toBe("squat");
      expect(phone.outbox()).toEqual([]);
    },
  );

  it("rejects cross-account completed edits without changing rows or issuing receipts", async () => {
    const seeded = await seedWebWorkout();
    const bob = "user_test_bob";
    await phone.as(bob).action(api.routes.auth.users.getOrCreate, {});
    await expect(
      phone.as(bob).mutation(api.routes.workouts.mutations.updateSet, {
        setId: seeded.setId,
        weight: 999,
      }),
    ).rejects.toThrow();
    expect((await detail(seeded.sessionId)).exercises[0].sets[0].weight).toBe(
      135,
    );
    expect((await phone.records(bob)).iosSyncReceipts).toEqual([]);
  });
});
