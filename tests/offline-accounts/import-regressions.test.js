import { act } from "react-test-renderer";
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
});
afterEach(async () => {
  await phone?.close();
  restoreTestEnvironment();
});

function noteBundle(notes) {
  return {
    format: "workout.export",
    version: 1,
    exportedAt: 0,
    unit: "lb",
    customExercises: [],
    templates: [
      {
        name: "Imported with note",
        exercises: [
          {
            slug: "bench",
            name: "Bench Press",
            sets: [{ weight: 100, reps: 5 }],
            notes,
          },
        ],
      },
    ],
  };
}

describe("portable import and sync preservation regressions", () => {
  it("imports over a cleared note and ignores both pre-clear and cleared stale subscriptions", async () => {
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.edit((local) => local.saveNote("bench", "Prior cue"));
    await phone.settle();
    const beforeClear = await phone
      .as(ALICE)
      .query(api.routes.ios.bootstrap.get, {});
    await phone.edit((local) => local.saveNote("bench", ""));
    await phone.settle();
    const afterClear = await phone
      .as(ALICE)
      .query(api.routes.ios.bootstrap.get, {});
    const tombstone = (await phone.records(ALICE)).exerciseNotes[0];
    const imported = await phone
      .as(ALICE)
      .mutation(api.routes.templates.mutations.importBundle, {
        includeNotes: true,
        bundle: noteBundle("Requested imported cue"),
      });
    expect(imported.notesImported).toBe(1);
    const result = (await phone.records(ALICE)).exerciseNotes[0];
    expect(result).toMatchObject({
      _id: tombstone._id,
      notes: "Requested imported cue",
      revision: tombstone.revision + 1,
    });
    await act(async () => phone.pull());
    await phone.tick();
    expect((await phone.notes(["bench"])).bench).toBe("Requested imported cue");
    for (const stale of [beforeClear, afterClear]) {
      await act(async () => {
        phone.bootstrap = stale;
        phone.notify();
      });
      await phone.tick();
      expect((await phone.notes(["bench"])).bench).toBe(
        "Requested imported cue",
      );
      expect(phone.outbox()).toHaveLength(0);
    }
    const again = await phone
      .as(ALICE)
      .mutation(api.routes.templates.mutations.importBundle, {
        includeNotes: true,
        bundle: noteBundle("A different imported cue"),
      });
    expect(again.notesImported).toBe(0);
    expect((await phone.records(ALICE)).exerciseNotes[0]).toEqual(result);
  });

  it("syncs maximum-length colliding names through lost responses and restart without duplicates", async () => {
    await phone.cloud.run((ctx) =>
      ctx.db.insert("users", {
        workosId: ALICE,
        email: "alice@example.invalid",
        unit: "lb",
        createdAt: 1,
      }),
    );
    const name = "x".repeat(100);
    const existingNames = [
      name,
      ...Array.from({ length: 8 }, (_, i) => `${"x".repeat(96)} (${i + 2})`),
    ];
    for (const [index, existingName] of existingNames.entries()) {
      await phone.as(ALICE).mutation(api.routes.ios.sync.pushTemplate, {
        operationId: `long-cloud-${index}`,
        deviceId: "other-device",
        template: {
          remoteId: null,
          name: existingName,
          exercises: [{ slug: "squat", sets: [{ weight: 100, reps: 5 }] }],
        },
      });
    }
    const original = await phone.records(ALICE);
    await phone.continueOffline();
    const templateId = await phone.edit((local) =>
      local.saveTemplate({
        name,
        exercises: [{ slug: "bench", sets: [{ weight: 135, reps: 5 }] }],
      }),
    );
    const operationId = phone
      .outbox()
      .find((row) => row.entity_id === templateId).operation_id;
    phone.faults.push({ name: "pushTemplate", loseResponse: true });
    await phone.connect();
    await phone.signIn(ALICE);
    await phone.window(1_000);
    expect(
      phone.calls.some(
        (call) =>
          call.operationId === operationId && call.committed && !call.delivered,
      ),
    ).toBe(true);
    await phone.reopen();
    await phone.connect();
    await phone.settle();
    const result = await phone.records(ALICE);
    expect(result.workoutTemplates).toHaveLength(
      original.workoutTemplates.length + 1,
    );
    expect(
      result.workoutTemplates.filter(
        (row) => row.name === `${"x".repeat(95)} (10)`,
      ),
    ).toHaveLength(1);
    for (const template of original.workoutTemplates)
      expect(
        result.workoutTemplates.find((row) => row._id === template._id),
      ).toEqual(template);
    const attempts = phone.calls.filter((call) => call.name === "pushTemplate");
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(new Set(attempts.map((call) => call.operationId))).toEqual(
      new Set([operationId]),
    );
    expect(phone.outbox()).toHaveLength(0);
  });
});
