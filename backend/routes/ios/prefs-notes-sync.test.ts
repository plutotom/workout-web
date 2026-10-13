import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MutationCtx } from "../../_generated/server";
import { pushExerciseNote, pushPreferences } from "./sync";

const upsert = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../lib/auth", () => ({
  requireUser: async () => ({ _id: "user-1" }),
}));
vi.mock("../../lib/exercise_notes", () => ({
  upsertExerciseNote: upsert,
}));

function ctxFixture(receipt: Record<string, unknown> | null = null) {
  const insert = vi.fn(async () => "receipt-1");
  const patch = vi.fn(async () => {});
  const ctx = {
    db: {
      query() {
        return {
          withIndex() {
            return this;
          },
          async first() {
            return receipt;
          },
        };
      },
      insert,
      patch,
    },
  } as unknown as MutationCtx;
  return { ctx, insert, patch };
}

async function callNote(
  ctx: MutationCtx,
  args: { operationId: string; slug: string; notes: string },
) {
  const handler = (
    pushExerciseNote as unknown as {
      _handler: (
        inner: MutationCtx,
        value: {
          operationId: string;
          deviceId: string;
          note: { slug: string; notes: string };
        },
      ) => Promise<{ serverTime: number }>;
    }
  )._handler;
  return handler(ctx, {
    operationId: args.operationId,
    deviceId: "device-1",
    note: { slug: args.slug, notes: args.notes },
  });
}

async function callPrefs(
  ctx: MutationCtx,
  operationId: string,
  preferences: {
    unit: "lb" | "kg";
    barWeightLb: number;
    barWeightKg: number;
    activeWorkoutMode: "list" | "focus";
    restTimerEnabled: boolean;
  },
) {
  const handler = (
    pushPreferences as unknown as {
      _handler: (
        inner: MutationCtx,
        value: {
          operationId: string;
          deviceId: string;
          preferences: typeof preferences;
        },
      ) => Promise<{ serverTime: number }>;
    }
  )._handler;
  return handler(ctx, {
    operationId,
    deviceId: "device-1",
    preferences,
  });
}

describe("pushExerciseNote", () => {
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue(undefined);
  });

  it("upserts the note and records a receipt", async () => {
    const { ctx, insert } = ctxFixture();
    await callNote(ctx, {
      operationId: "op-note",
      slug: "bench-press",
      notes: "pause at the bottom",
    });
    expect(upsert).toHaveBeenCalledWith(
      ctx,
      "user-1",
      "bench-press",
      "pause at the bottom",
    );
    expect(insert).toHaveBeenCalledWith(
      "iosSyncReceipts",
      expect.objectContaining({ operationId: "op-note", deviceId: "device-1" }),
    );
  });

  it("does not insert a second receipt on retry", async () => {
    const { ctx, insert } = ctxFixture({ _id: "existing" });
    await callNote(ctx, {
      operationId: "op-note",
      slug: "bench-press",
      notes: "pause at the bottom",
    });
    expect(upsert).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("pushPreferences", () => {
  it("patches the user row from the phone snapshot", async () => {
    const { ctx, patch, insert } = ctxFixture();
    await callPrefs(ctx, "op-prefs", {
      unit: "kg",
      barWeightLb: 35.4,
      barWeightKg: 20.2,
      activeWorkoutMode: "list",
      restTimerEnabled: false,
    });
    expect(patch).toHaveBeenCalledWith("user-1", {
      unit: "kg",
      barWeightLb: 35,
      barWeightKg: 20,
      activeWorkoutMode: "list",
      restTimerEnabled: false,
    });
    expect(insert).toHaveBeenCalledWith(
      "iosSyncReceipts",
      expect.objectContaining({ operationId: "op-prefs" }),
    );
  });
});
