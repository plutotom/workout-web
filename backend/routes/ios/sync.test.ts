import { validate } from "convex-helpers/validators";
import type { Infer } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MutationCtx } from "../../_generated/server";
import { pushSession, sessionSnapshotValidator } from "./sync";

const access = vi.hoisted(() => ({ plan: "free", subscription: vi.fn() }));
vi.mock("../../lib/auth", () => ({
  requireUser: async () => ({ _id: "user-1", plan: access.plan }),
}));
vi.mock("../billing/polar", () => ({
  polar: { getCurrentSubscription: access.subscription },
}));
beforeEach(() => {
  access.plan = "free";
  access.subscription.mockReset().mockResolvedValue(null);
});

const session = {
  clientId: "note-1",
  remoteTemplateId: null,
  templateName: "Note workout",
  status: "in_progress" as const,
  sessionKind: "tracked" as const,
  inputMode: "note" as const,
  noteUnit: "lb" as const,
  noteBody: "  Bench 10@150\n\nPull up, 10, 9, 9\n",
  startedAt: 100,
  completedAt: null,
  updatedAt: 300,
  exercises: [],
};

function serverFixture(
  existing: Record<string, unknown> | null = null,
  receipt: Record<string, unknown> | null = null,
) {
  const insert = vi
    .fn<(table: string, fields: unknown) => Promise<string>>()
    .mockResolvedValue("remote-session");
  const patch = vi.fn(async () => {});
  const ctx = {
    db: {
      async get() {
        return existing ? { ...existing, userId: "user-1" } : null;
      },
      query(table: string) {
        let indexName: string;
        return {
          withIndex(name: string) {
            indexName = name;
            return this;
          },
          async first() {
            if (table === "iosSyncReceipts") return receipt;
            return table === "workoutSessions" &&
              indexName === "by_user_client_id"
              ? existing
              : null;
          },
          async take() {
            return [];
          },
          async collect() {
            return [];
          },
        };
      },
      insert,
      patch,
    },
  } as unknown as MutationCtx;
  return { ctx, insert, patch };
}

async function push(
  ctx: MutationCtx,
  incoming: Infer<typeof sessionSnapshotValidator> = session,
) {
  const handler = (
    pushSession as unknown as {
      _handler: (
        ctx: MutationCtx,
        args: {
          operationId: string;
          deviceId: string;
          session: Infer<typeof sessionSnapshotValidator>;
        },
      ) => Promise<unknown>;
    }
  )._handler;
  return handler(ctx, {
    operationId: "operation-1",
    deviceId: "device-1",
    session: incoming,
  });
}

describe("iOS note snapshots", () => {
  const converted = {
    ...session,
    status: "completed" as const,
    completedAt: 200,
    inputMode: "list" as const,
    exercises: [
      {
        clientId: "lift-1",
        slug: "deadlift",
        orderIndex: 0,
        restSeconds: 75,
        notes: "Set 1: failed attempt after 4 completed reps.",
        sets: [
          {
            clientId: "set-1",
            orderIndex: 0,
            targetWeight: 225,
            targetReps: 4,
            weight: 225,
            reps: 4,
            completed: true,
            completedAt: 200,
          },
        ],
      },
    ],
  };
  it.each([null, { ...session, _id: "remote-session", clientUpdatedAt: 200 }])(
    "rejects free conversion with existing row %j before any writes",
    async (existing) => {
      const fixture = serverFixture(existing);
      await expect(push(fixture.ctx, converted)).rejects.toThrow(
        "requires Pro",
      );
      expect(fixture.insert).not.toHaveBeenCalled();
      expect(fixture.patch).not.toHaveBeenCalled();
    },
  );
  it.each(["manual", "subscription"])(
    "accepts conversion with %s Pro and credits only the recorded sets",
    async (grant) => {
      if (grant === "manual") access.plan = "pro";
      else access.subscription.mockResolvedValue({ status: "active" });
      const fixture = serverFixture({
        ...session,
        _id: "remote-session",
        status: "completed",
        completedAt: 200,
        clientUpdatedAt: 200,
        externalProvider: "apple_health",
        externalId: "watch",
        durationSeconds: 100,
        countsTowardGoals: true,
      });
      await push(fixture.ctx, {
        ...converted,
        startedAt: 999,
        completedAt: 1000,
        externalProvider: null,
        externalId: null,
      });
      expect(fixture.patch).toHaveBeenCalledWith(
        "remote-session",
        expect.objectContaining({
          inputMode: "list",
          noteBody: session.noteBody,
          noteUnit: "lb",
          startedAt: 100,
          completedAt: 200,
          externalId: "watch",
          durationSeconds: 100,
          countsTowardGoals: true,
        }),
      );
      expect(fixture.insert.mock.calls.map(([table]) => table)).toEqual([
        "sessionExercises",
        "sets",
        "iosSyncReceipts",
      ]);
      expect(fixture.insert).toHaveBeenCalledWith(
        "sets",
        expect.objectContaining({ reps: 4, weight: 225, completed: true }),
      );
    },
  );
  it("does not require a renewed subscription to sync an already converted workout", async () => {
    const fixture = serverFixture({
      ...converted,
      _id: "remote-session",
      clientUpdatedAt: 200,
    });
    expect(await push(fixture.ctx, converted)).toMatchObject({
      status: "applied",
    });
    expect(access.subscription).not.toHaveBeenCalled();
  });
  it("acknowledges a conversion retry without writing another session or set", async () => {
    const fixture = serverFixture(
      { ...converted, _id: "remote-session", clientUpdatedAt: 300 },
      { _id: "receipt", operationId: "operation-1" },
    );
    expect(await push(fixture.ctx, converted)).toMatchObject({
      status: "duplicate",
      remoteSessionId: "remote-session",
    });
    expect(fixture.insert).not.toHaveBeenCalled();
    expect(fixture.patch).not.toHaveBeenCalled();
    expect(access.subscription).not.toHaveBeenCalled();
  });
  it("enforces Pro when a conversion snapshot omits the optional list-mode flag", async () => {
    const fixture = serverFixture();
    await expect(
      push(fixture.ctx, { ...converted, inputMode: undefined }),
    ).rejects.toThrow("requires Pro");
    expect(fixture.insert).not.toHaveBeenCalled();
  });
  it("does not let a pre-conversion note upload erase confirmed sets or change original text", async () => {
    const fixture = serverFixture({
      ...converted,
      _id: "remote-session",
      clientUpdatedAt: 200,
    });
    expect(
      await push(fixture.ctx, { ...session, updatedAt: 500 }),
    ).toMatchObject({ status: "stale" });
    await expect(
      push(fixture.ctx, { ...converted, noteBody: "changed" }),
    ).rejects.toThrow("original note");
    expect(fixture.insert).not.toHaveBeenCalled();
    expect(fixture.patch).not.toHaveBeenCalled();
  });
  it.each(["custom:someone-else", "unknown"])(
    "rejects conversion mapped to %s",
    async (slug) => {
      access.plan = "pro";
      const fixture = serverFixture();
      await expect(
        push(fixture.ctx, {
          ...converted,
          exercises: [{ ...converted.exercises[0], slug }],
        }),
      ).rejects.toThrow("active exercises");
      expect(fixture.insert).not.toHaveBeenCalled();
    },
  );
  it.each([NaN, Infinity, -1, 1.5, 10001])(
    "rejects invalid converted weight %s before writes",
    async (weight) => {
      access.plan = "pro";
      const fixture = serverFixture();
      await expect(
        push(fixture.ctx, {
          ...converted,
          exercises: [
            {
              ...converted.exercises[0],
              sets: [{ ...converted.exercises[0].sets[0], weight }],
            },
          ],
        }),
      ).rejects.toThrow("valid completed");
      expect(fixture.insert).not.toHaveBeenCalled();
    },
  );
  it("accepts optional note fields and keeps legacy snapshots valid", () => {
    expect(validate(sessionSnapshotValidator, session, { throw: true })).toBe(
      true,
    );
    const legacy: Partial<typeof session> = { ...session };
    delete legacy.inputMode;
    delete legacy.noteBody;
    delete legacy.noteUnit;
    expect(validate(sessionSnapshotValidator, legacy, { throw: true })).toBe(
      true,
    );
    expect(
      validate(sessionSnapshotValidator, { ...session, noteUnit: "stone" }),
    ).toBe(false);
  });

  it("persists exact note text, mode, unit and no invented exercises", async () => {
    const fixture = serverFixture();
    expect(await push(fixture.ctx)).toMatchObject({ status: "applied" });
    expect(fixture.insert).toHaveBeenCalledWith(
      "workoutSessions",
      expect.objectContaining({
        inputMode: "note",
        noteBody: session.noteBody,
        noteUnit: "lb",
        sessionKind: "tracked",
      }),
    );
    expect(fixture.insert.mock.calls.map(([table]) => table)).toEqual([
      "workoutSessions",
      "iosSyncReceipts",
    ]);
  });

  it("accepts 20,000 characters and rejects overflow before writes", async () => {
    const fixture = serverFixture();
    await push(fixture.ctx, { ...session, noteBody: "n".repeat(20_000) });
    const overflow = serverFixture();
    await expect(
      push(overflow.ctx, { ...session, noteBody: "n".repeat(20_001) }),
    ).rejects.toThrow("20000 characters");
    expect(overflow.insert).not.toHaveBeenCalled();
    expect(overflow.patch).not.toHaveBeenCalled();
  });

  it("keeps the newer saved note when an older snapshot arrives", async () => {
    const fixture = serverFixture({
      _id: "remote-session",
      sessionKind: "tracked",
      clientUpdatedAt: 301,
    });
    expect(await push(fixture.ctx)).toMatchObject({
      status: "stale",
      remoteSessionId: "remote-session",
    });
    expect(fixture.insert).not.toHaveBeenCalled();
    expect(fixture.patch).not.toHaveBeenCalled();
  });

  it.each([null, undefined, "health-uuid"])(
    "preserves a late Health link when an offline note edit uploads UUID %s",
    async (externalId) => {
      const health = {
        externalProvider: "apple_health",
        externalId: "health-uuid",
        activityType: "traditionalStrengthTraining",
        sourceName: "Apple Watch",
        sourceBundleId: "com.apple.health",
        durationSeconds: 100,
        energyKcal: 42,
        distanceMeters: 0,
        importedAt: 350,
        healthSegments: [
          {
            activityType: "traditionalStrengthTraining",
            activityName: "Strength training",
            startedAt: 100,
            endedAt: 200,
            durationSeconds: 100,
            energyKcal: 42,
            distanceMeters: null,
          },
        ],
      };
      const fixture = serverFixture({
        _id: "remote-session",
        ...session,
        status: "completed",
        completedAt: 200,
        clientUpdatedAt: 350,
        ...health,
      });
      expect(
        await push(fixture.ctx, {
          ...session,
          status: "completed",
          completedAt: 200,
          updatedAt: 400,
          noteBody: "Edited offline on phone B",
          externalProvider: null,
          externalId,
          energyKcal: null,
          durationSeconds: null,
          healthSegments: [],
        }),
      ).toMatchObject({ status: "applied" });
      expect(fixture.patch).toHaveBeenCalledWith(
        "remote-session",
        expect.objectContaining({
          noteBody: "Edited offline on phone B",
          clientUpdatedAt: 400,
          startedAt: 100,
          completedAt: 200,
          ...health,
        }),
      );
    },
  );

  it("accepts a new Health UUID without copying metadata from the old link", async () => {
    const fixture = serverFixture({
      _id: "remote-session",
      ...session,
      status: "completed",
      completedAt: 200,
      clientUpdatedAt: 350,
      externalProvider: "apple_health",
      externalId: "old-health-uuid",
      energyKcal: 42,
    });
    await push(fixture.ctx, {
      ...session,
      status: "completed",
      completedAt: 200,
      updatedAt: 400,
      externalProvider: "apple_health",
      externalId: "new-health-uuid",
      energyKcal: null,
    });
    expect(fixture.patch).toHaveBeenCalledWith(
      "remote-session",
      expect.objectContaining({
        externalId: "new-health-uuid",
        externalProvider: "apple_health",
        energyKcal: undefined,
      }),
    );
  });
});
