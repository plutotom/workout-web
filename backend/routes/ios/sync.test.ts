import { validate } from "convex-helpers/validators";
import type { Infer } from "convex/values";
import { describe, expect, it, vi } from "vitest";

import type { MutationCtx } from "../../_generated/server";
import { pushSession, sessionSnapshotValidator } from "./sync";

vi.mock("../../lib/auth", () => ({
  requireUser: async () => ({ _id: "user-1" }),
}));

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

function serverFixture(existing: Record<string, unknown> | null = null) {
  const insert = vi
    .fn<(table: string, fields: unknown) => Promise<string>>()
    .mockResolvedValue("remote-session");
  const patch = vi.fn(async () => {});
  const ctx = {
    db: {
      query(table: string) {
        let indexName: string;
        return {
          withIndex(name: string) {
            indexName = name;
            return this;
          },
          async first() {
            return table === "workoutSessions" &&
              indexName === "by_user_client_id"
              ? existing
              : null;
          },
          async take() {
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

async function push(ctx: MutationCtx, incoming = session) {
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
});
