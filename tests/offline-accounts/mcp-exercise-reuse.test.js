import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../backend/_generated/api";
import { hashApiKey } from "../../backend/lib/apiKeys";
import {
  PhoneScenario,
  installTestEnvironment,
  restoreTestEnvironment,
} from "./harness";

const ALICE = "user_test_alice";
const KEY = `waw_${"a".repeat(43)}`;
const fields = {
  name: "Fixture lateral raise",
  category: "shoulders",
  usesBar: false,
};
let phone;
let userId;
beforeEach(async () => {
  installTestEnvironment();
  vi.stubEnv("MCP_API_KEY_PEPPER", "synthetic-mcp-reuse-fixture-pepper");
  phone = await new PhoneScenario().open();
  await phone.connect();
  await phone.signIn(ALICE);
  await phone.settle();
  userId = (await phone.records(ALICE)).user._id;
  const keyHash = await hashApiKey(KEY);
  await phone.cloud.run((ctx) =>
    ctx.db.insert("mcpApiKeys", {
      userId,
      keyHash,
      keyPrefix: "waw_fixture",
      name: "Synthetic fixture",
      createdAt: 1,
    }),
  );
});
afterEach(async () => {
  await phone?.close();
  restoreTestEnvironment();
  vi.unstubAllEnvs();
});
const ensure = (args = {}) =>
  phone.cloud.mutation(api.routes.mcp.mutations.createCustomExercise, {
    apiKey: KEY,
    ...fields,
    ...args,
  });
const seed = (args = {}) =>
  phone.cloud.run((ctx) =>
    ctx.db.insert("customExercises", {
      userId,
      ...fields,
      archived: false,
      ...args,
    }),
  );

describe("MCP exercise reuse through authenticated production mutations", () => {
  it("reuses a cloud lift without changing its labels, notes or template references", async () => {
    const id = await seed({ short: "Keep this label" });
    const slug = `custom:${id}`;
    await phone.as(ALICE).mutation(api.routes.exercises.mutations.upsertNote, {
      exerciseSlug: slug,
      notes: "Keep this cue",
    });
    const result = await ensure({
      name: "  FIXTURE   lateral raise  ",
      short: "Do not overwrite",
    });
    expect(result).toMatchObject({
      id,
      slug,
      source: "custom",
      reused: true,
      restored: false,
    });
    const templateId = await phone.cloud.mutation(
      api.routes.mcp.mutations.createTemplate,
      {
        apiKey: KEY,
        name: "MCP fixture",
        exercises: [{ slug: result.slug, sets: [{ weight: 20, reps: 10 }] }],
      },
    );
    const records = await phone.records(ALICE);
    expect(records.customExercises).toHaveLength(1);
    expect(records.customExercises[0].short).toBe("Keep this label");
    expect(records.exerciseNotes[0].notes).toBe("Keep this cue");
    expect(records.templateExercises).toContainEqual(
      expect.objectContaining({ templateId, exerciseSlug: slug }),
    );
  });

  it("does not duplicate a new exercise when creation is retried or concurrent", async () => {
    const results = await Promise.all([ensure(), ensure(), ensure()]);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect((await ensure()).id).toBe(results[0].id);
    expect((await phone.records(ALICE)).customExercises).toHaveLength(1);
  });

  it("restores one archived exact match while preserving its identity", async () => {
    const id = await seed({ archived: true });
    expect(await ensure()).toMatchObject({ id, reused: true, restored: true });
    const rows = (await phone.records(ALICE)).customExercises;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ _id: id, archived: false });
  });

  it("prefers an active exact match over archived copies and refuses ambiguous active copies", async () => {
    const active = await seed();
    const archived = await seed({ archived: true });
    expect((await ensure()).id).toBe(active);
    const other = await seed();
    await expect(ensure()).rejects.toThrow("Multiple exercises match");
    const rows = (await phone.records(ALICE)).customExercises;
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row._id === archived).archived).toBe(true);
    expect(
      rows
        .filter((row) => !row.archived)
        .map((row) => row._id)
        .sort(),
    ).toEqual([active, other].sort());
  });

  it("does not revive either lift when archived matches are ambiguous", async () => {
    await seed({ archived: true });
    await seed({ archived: true });
    await expect(ensure()).rejects.toThrow("Multiple exercises match");
    const rows = (await phone.records(ALICE)).customExercises;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.archived)).toBe(true);
  });

  it("keeps an owned custom identity ahead of an identical curated name", async () => {
    const id = await seed({
      name: "Bench Press (Barbell)",
      category: "chest",
      usesBar: true,
    });
    expect(
      await ensure({
        name: "Bench Press (Barbell)",
        category: "chest",
        usesBar: true,
      }),
    ).toMatchObject({
      id,
      slug: `custom:${id}`,
      source: "custom",
      reused: true,
    });
    expect((await phone.records(ALICE)).customExercises).toHaveLength(1);
  });

  it("requires a distinct name for a deliberately different variation", async () => {
    const id = await seed();
    await expect(ensure({ usesBar: true })).rejects.toThrow(
      "different equipment or muscle group",
    );
    await expect(ensure({ category: "back" })).rejects.toThrow(
      "different equipment or muscle group",
    );
    const variation = await ensure({
      name: "Fixture lateral raise (barbell)",
      usesBar: true,
    });
    expect(variation.id).not.toBe(id);
    expect(variation.reused).toBe(false);
    expect((await phone.records(ALICE)).customExercises).toHaveLength(2);
  });

  it.each([
    ["  bench press (barbell) ", true, "bench"],
    ["Bench Press (Dumbbell)", false, "db-bench"],
  ])(
    "reuses the curated catalog instead of creating a custom copy (%s)",
    async (name, usesBar, slug) => {
      const result = await ensure({ name, category: "chest", usesBar });
      expect(result).toEqual({
        id: null,
        slug,
        source: "catalog",
        reused: true,
        restored: false,
      });
      expect((await phone.records(ALICE)).customExercises).toEqual([]);
      const templateId = await phone.cloud.mutation(
        api.routes.mcp.mutations.createTemplate,
        {
          apiKey: KEY,
          name: "Catalog fixture",
          exercises: [{ slug: result.slug, sets: [{ weight: 135, reps: 5 }] }],
        },
      );
      expect((await phone.records(ALICE)).templateExercises).toContainEqual(
        expect.objectContaining({ templateId, exerciseSlug: slug }),
      );
    },
  );

  it("allows reuse at the account limit and rejects a genuinely new lift", async () => {
    const id = await seed();
    await phone.cloud.run(async (ctx) => {
      for (let i = 1; i < 200; i++)
        await ctx.db.insert("customExercises", {
          userId,
          ...fields,
          name: `Other fixture ${i}`,
          archived: false,
        });
    });
    expect((await ensure()).id).toBe(id);
    await expect(ensure({ name: "New over-limit fixture" })).rejects.toThrow(
      "At most 200 custom exercises",
    );
    expect((await phone.records(ALICE)).customExercises).toHaveLength(200);
  });

  it("scopes matching to the API key owner and rejects invalid keys", async () => {
    const aliceLift = await seed();
    await phone.signIn("user_test_bob");
    await phone.settle();
    const bobId = (await phone.records("user_test_bob")).user._id;
    await phone.cloud.run((ctx) =>
      ctx.db.insert("customExercises", {
        userId: bobId,
        ...fields,
        name: "Bob-only fixture",
        archived: false,
      }),
    );
    const own = await ensure({ name: "Bob-only fixture" });
    const aliceRows = (await phone.records(ALICE)).customExercises;
    expect(aliceRows).toHaveLength(2);
    expect(aliceRows.some((row) => row._id === own.id)).toBe(true);
    expect(aliceRows.some((row) => row._id === aliceLift)).toBe(true);
    expect((await phone.records("user_test_bob")).customExercises).toHaveLength(
      1,
    );
    await expect(ensure({ apiKey: `waw_${"z".repeat(43)}` })).rejects.toThrow(
      "Invalid API key",
    );
  });

  it.each(["before-ack", "after-ack"])(
    "retains the reused lift through offline workout completion, restart, retry and sharing (%s)",
    async (subscriptionOrder) => {
      phone.subscriptionOrder = subscriptionOrder;
      const id = await seed({ clientId: "another-phone" });
      await phone.settle();
      const result = await ensure();
      expect(result.id).toBe(id);
      await phone.offline();
      const sessionId = await phone.edit((local) => local.startBlank());
      await phone.edit((local) =>
        local.addExercise(sessionId, result.slug, [{ weight: 20, reps: 10 }]),
      );
      await phone.edit((local) => local.finish(sessionId));
      const saved = await phone.workout(sessionId);
      await phone.reopen();
      phone.faults.push({ name: "pushSession", loseResponse: true });
      await phone.connect();
      await phone.settle();
      const after = await phone.workout(sessionId);
      expect(after.exercises[0]._id).toBe(saved.exercises[0]._id);
      expect(after.exercises[0].sets[0]._id).toBe(
        saved.exercises[0].sets[0]._id,
      );
      expect(after.exercises[0].slug).toBe(result.slug);
      expect(phone.outbox()).toEqual([]);
      expect((await phone.records(ALICE)).customExercises).toHaveLength(1);
      const remoteId = await phone
        .as(ALICE)
        .query(api.routes.social.queries.syncedSession, { localId: sessionId });
      const postId = await phone
        .as(ALICE)
        .mutation(api.routes.social.mutations.shareWorkout, {
          sessionId: remoteId,
          caption: "Fixture MCP lift",
        });
      expect(postId).toBeTruthy();
    },
  );
});
