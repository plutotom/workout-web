import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

describe("live workout sqlite writes", () => {
  it("keeps typed pull-up reps when a save overlaps outbox drain", async () => {
    const sessionId = await phone.edit((local) => local.startBlank());
    await phone.edit((local) =>
      local.addExercise(sessionId, "pull-up", [
        { weight: 0, reps: 5 },
        { weight: 0, reps: 5 },
      ]),
    );
    const setId = (await phone.workout(sessionId)).exercises[0].sets[1]._id;
    await phone.offline();
    await phone.edit((local) => local.updateSet(setId, { reps: 7 }));
    await phone.connect();
    await Promise.all([
      phone.edit((local) => local.updateSet(setId, { reps: 8 })),
      phone.settle(),
    ]);
    expect((await phone.workout(sessionId)).exercises[0].sets[1].reps).toBe(8);
    await phone.settle();
    expect(
      (await phone.records(ALICE)).sets.some((set) => set.reps === 8),
    ).toBe(true);
    expect(phone.errors).toEqual([]);
  });
});
