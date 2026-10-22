import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PhoneScenario,
  installTestEnvironment,
  restoreTestEnvironment,
} from "./harness";
import {
  setHealthExportEnabled,
  getLocalWorkout,
} from "@/data/local/repository";

import {
  listPendingHealthExports,
  wasWatchRecorded,
} from "@/data/local/repository";
const ALICE = "user_test_watch_alice";
const BOB = "user_test_watch_bob";
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

const recording = (sessionId) => ({
  type: "state",
  sessionId,
  status: "recording",
  reachable: true,
});
const ended = (sessionId) => ({
  type: "ended",
  sessionId,
  healthUuid: `watch-health-${sessionId}`,
});

describe("Watch recording account and sync preservation", () => {
  it.each(["saving", "saveFailed", "locked-success"])(
    "preserves Watch ownership through offline restart and recovery (%s)",
    async (phase) => {
      await phone.offline();
      await setHealthExportEnabled(phone.db, true);
      const id = await phone.edit((local) => local.startBlank());
      await phone.watchEvent(
        phase === "locked-success"
          ? { type: "ended", sessionId: id, healthUuid: "", healthSaved: true }
          : { type: "state", sessionId: id, status: phase, reachable: true },
      );
      await phone.edit((local) => local.finish(id));
      expect(await wasWatchRecorded(phone.db, id)).toBe(true);
      expect(await listPendingHealthExports(phone.db)).toHaveLength(0);
      await phone.reopen();
      expect(await wasWatchRecorded(phone.db, id)).toBe(true);
      expect(await listPendingHealthExports(phone.db)).toHaveLength(0);
      await phone.watchEvent(ended(id));
      await phone.connect();
      await phone.settle();
      expect((await phone.records(ALICE)).workoutSessions).toHaveLength(1);
      expect((await getLocalWorkout(phone.db, id)).health.externalId).toBe(
        ended(id).healthUuid,
      );
    },
  );
  it("resumes the phone export if Watch launch fails after Finish and restart", async () => {
    await phone.offline();
    await setHealthExportEnabled(phone.db, true);
    const id = await phone.edit((local) => local.startBlank());
    await phone.watchEvent({
      type: "state",
      sessionId: id,
      status: "starting",
      reachable: true,
    });
    await phone.edit((local) => local.finish(id));
    expect(await listPendingHealthExports(phone.db)).toHaveLength(0);
    expect(await wasWatchRecorded(phone.db, id)).toBe(false);
    await phone.reopen();
    await phone.watchEvent({
      type: "state",
      sessionId: id,
      status: "idle",
      reachable: true,
    });
    expect(await listPendingHealthExports(phone.db)).toMatchObject([
      { sessionId: id },
    ]);
    await phone.watchEvent({
      type: "state",
      sessionId: id,
      status: "idle",
      reachable: true,
    });
    expect(await listPendingHealthExports(phone.db)).toHaveLength(1);
  });
  it.each(["before-ack", "after-ack"])(
    "preserves one Health link across offline restart and lost upload replies (%s)",
    async (order) => {
      phone.subscriptionOrder = order;
      await phone.offline();
      await setHealthExportEnabled(phone.db, true);
      const id = await phone.edit((local) => local.startBlank());
      await phone.edit((local) =>
        local.addExercise(id, "bench", [{ weight: 135, reps: 5 }]),
      );
      await phone.watchEvent(recording(id));
      await phone.edit((local) => local.finish(id));
      expect(
        phone.sql
          .prepare(
            "SELECT health_export_pending FROM local_sessions WHERE id = ?",
          )
          .get(id).health_export_pending,
      ).toBe(0);
      await phone.reopen();
      await phone.watchEvent(ended(id));
      expect((await getLocalWorkout(phone.db, id)).health.externalId).toBe(
        ended(id).healthUuid,
      );
      const updatedAt = (await getLocalWorkout(phone.db, id)).updatedAt;
      await phone.watchEvent(ended(id));
      expect((await getLocalWorkout(phone.db, id)).updatedAt).toBe(updatedAt);
      phone.faults.push({ name: "pushSession", loseResponse: true });
      await phone.connect();
      await phone.window(125_000);
      await phone.settle();
      const rows = (await phone.records(ALICE)).workoutSessions;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        externalProvider: "apple_health",
        externalId: ended(id).healthUuid,
        status: "completed",
      });
      expect(phone.outbox()).toHaveLength(0);
    },
  );
  it("ignores replay for another account and restores it when its owner returns", async () => {
    await phone.offline();
    const id = await phone.edit((local) => local.startBlank());
    await phone.watchEvent(recording(id));
    await phone.edit((local) => local.finish(id));
    await phone.connect();
    await phone.settle();
    await phone.signOut();
    await phone.signIn(BOB);
    await phone.settle();
    await phone.watchEvent(ended(id));
    expect(
      phone.sql
        .prepare("SELECT * FROM local_health_state WHERE key LIKE 'watch_%'")
        .all(),
    ).toEqual([]);
    expect((await phone.records(BOB)).workoutSessions).toHaveLength(0);
    await phone.signOut();
    await phone.signIn(ALICE);
    await phone.offline();
    await phone.watchEvent(ended(id));
    expect((await getLocalWorkout(phone.db, id)).health.externalId).toBe(
      ended(id).healthUuid,
    );
    await phone.connect();
    await phone.settle();
    expect((await phone.records(ALICE)).workoutSessions).toHaveLength(1);
    expect((await phone.records(BOB)).workoutSessions).toHaveLength(0);
  });
});
