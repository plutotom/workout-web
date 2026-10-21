import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../backend/_generated/api";
import {
  PhoneScenario,
  installTestEnvironment,
  restoreTestEnvironment,
} from "./harness";

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
const fields = {
  name: "Fixture raise",
  category: "shoulders",
  usesBar: false,
  archived: false,
};
async function seedCloudPair() {
  const { user } = await phone.records(ALICE);
  return phone.cloud.run(async (ctx) => {
    const original = await ctx.db.insert("customExercises", {
      userId: user._id,
      clientId: "first-phone",
      ...fields,
    });
    const duplicate = await ctx.db.insert("customExercises", {
      userId: user._id,
      clientId: original,
      ...fields,
      archived: true,
    });
    return { original, duplicate };
  });
}

describe("custom lift identity recovery and workout sharing", () => {
  it.each(["before-ack", "after-ack"])(
    "unblocks the entire outbox after an old custom lift identity collision (%s)",
    async (subscriptionOrder) => {
      phone.subscriptionOrder = subscriptionOrder;
      await phone.offline();
      const { original, duplicate } = await seedCloudPair();
      // The legacy phone row keeps the original cloud id as its SQLite id,
      // but an older bootstrap rebound its remote id and slug to the duplicate.
      await phone.db.runAsync(
        "INSERT INTO local_custom_exercises (id, remote_id, slug, name, category, uses_bar, archived, updated_at) VALUES (?, ?, ?, 'Fixture raise', 'shoulders', 0, 1, 1)",
        original,
        duplicate,
        `custom:${duplicate}`,
      );
      const sessionId = await phone.edit((local) => local.startBlank());
      await phone.edit((local) =>
        local.addExercise(sessionId, `custom:${duplicate}`, [
          { weight: 20, reps: 10 },
        ]),
      );
      await phone.edit((local) => local.finish(sessionId));
      await phone.edit((local) =>
        local.saveNote(`custom:${duplicate}`, "Offline cue"),
      );
      const saved = await phone.workout(sessionId);
      await phone.reopen();
      phone.faults.push({ name: "pushSession", loseResponse: true });
      await phone.connect();
      await phone.settle();
      const identities = await phone.db.getAllAsync(
        "SELECT id, remote_id, slug FROM local_custom_exercises ORDER BY remote_id",
      );
      expect(identities).toHaveLength(2);
      expect(identities).toContainEqual({
        id: original,
        remote_id: duplicate,
        slug: `custom:${duplicate}`,
      });
      const restoredOriginal = identities.find(
        (row) => row.remote_id === original,
      );
      expect(restoredOriginal.id).not.toBe(original);
      const after = await phone.workout(sessionId);
      expect(after._id).toBe(saved._id);
      expect(after.completedAt).toBe(saved.completedAt);
      expect(after.exercises[0]._id).toBe(saved.exercises[0]._id);
      expect(after.exercises[0].sets[0]._id).toBe(
        saved.exercises[0].sets[0]._id,
      );
      expect(after.exercises[0].slug).toBe(`custom:${duplicate}`);
      expect(
        (await phone.notes([`custom:${duplicate}`]))[`custom:${duplicate}`],
      ).toBe("Offline cue");
      expect(phone.outbox()).toEqual([]);
      const remoteId = await phone
        .as(ALICE)
        .query(api.routes.social.queries.syncedSession, { localId: sessionId });
      expect(remoteId).toBeTruthy();
      const postId = await phone
        .as(ALICE)
        .mutation(api.routes.social.mutations.shareWorkout, {
          sessionId: remoteId,
          caption: "Recovered offline workout",
        });
      expect(postId).toBeTruthy();
      const records = await phone.records(ALICE);
      expect(records.customExercises).toHaveLength(2);
      expect(records.workoutSessions).toHaveLength(1);
      expect(records.sessionExercises).toHaveLength(1);
      expect(records.sets).toHaveLength(1);
      await phone.reopen();
      await phone.settle();
      expect(
        await phone.db.getAllAsync(
          "SELECT id, remote_id, slug FROM local_custom_exercises ORDER BY remote_id",
        ),
      ).toEqual(identities);
    },
  );

  it("archives an adopted cloud lift with its explicit remote identity despite a conflicting legacy client id", async () => {
    const { original, duplicate } = await seedCloudPair();
    await phone.settle();
    await phone.offline();
    await phone.edit((local) => local.archiveCustomExercise(original));
    const queued = phone
      .outbox()
      .find((row) => row.entity_type === "custom_exercise");
    expect(JSON.parse(queued.payload_json).remoteId).toBe(original);
    await phone.reopen();
    phone.faults.push({ name: "pushCustomExercise", loseResponse: true });
    await phone.connect();
    await phone.settle();
    const rows = (await phone.records(ALICE)).customExercises;
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row._id === original).archived).toBe(true);
    expect(rows.find((row) => row._id === duplicate).archived).toBe(true);
  });

  it("accepts old cloud-id snapshots without creating another custom lift", async () => {
    const created = await phone
      .as(ALICE)
      .mutation(api.routes.exercises.mutations.create, {
        name: "Legacy raise",
        category: "shoulders",
        usesBar: false,
      });
    const result = await phone
      .as(ALICE)
      .mutation(api.routes.ios.sync.pushCustomExercise, {
        ownerWorkosId: ALICE,
        operationId: "legacy-archive",
        deviceId: "fixture-phone",
        exercise: {
          clientId: created.id,
          ...fields,
          short: null,
          archived: true,
        },
      });
    expect(result.remoteExerciseId).toBe(created.id);
    expect((await phone.records(ALICE)).customExercises).toHaveLength(1);
  });

  it("rejects an explicit custom lift identity owned by another account", async () => {
    const created = await phone
      .as(ALICE)
      .mutation(api.routes.exercises.mutations.create, {
        name: "Owned raise",
        category: "shoulders",
        usesBar: false,
      });
    await phone.signIn("user_test_bob");
    await phone.settle();
    await expect(
      phone
        .as("user_test_bob")
        .mutation(api.routes.ios.sync.pushCustomExercise, {
          ownerWorkosId: "user_test_bob",
          operationId: "foreign-archive",
          deviceId: "fixture-bob",
          exercise: {
            clientId: created.id,
            remoteId: created.id,
            ...fields,
            short: null,
            archived: true,
          },
        }),
    ).rejects.toThrow("Exercise not found");
    expect((await phone.records(ALICE)).customExercises[0].archived).toBe(
      false,
    );
    expect((await phone.records("user_test_bob")).customExercises).toEqual([]);
  });
});
