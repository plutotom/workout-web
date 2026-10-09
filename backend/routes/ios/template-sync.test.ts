import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { pushTemplate } from "./sync";

const handler = (
  pushTemplate as unknown as {
    _handler: (
      ctx: MutationCtx,
      args: ReturnType<typeof fixture>["args"],
    ) => Promise<{
      remoteTemplateId: Id<"workoutTemplates">;
      serverTime: number;
    }>;
  }
)._handler;

vi.mock("../../lib/auth", () => ({
  requireUser: async () => ({ _id: "user-1" }),
}));

function fixture(
  options: { receipt?: boolean; deleted?: boolean; owner?: string } = {},
) {
  const template = options.deleted
    ? null
    : { _id: "template-1", userId: options.owner ?? "user-1", name: "Push" };
  const exercises = [
    {
      _id: "exercise-1",
      exerciseSlug: "bench",
      orderIndex: 0,
      sets: [{ weight: 100, reps: 5 }],
    },
  ];
  const receipt = options.receipt
    ? { _id: "receipt-1", targetId: "template-1", appliedAt: 1234 }
    : null;
  const query = vi.fn((table: string) => ({
    withIndex: () => ({
      first: async () => (table === "iosSyncReceipts" ? receipt : null),
      collect: async () => exercises,
    }),
  }));
  const db = {
    query,
    get: vi.fn(async () => template),
    patch: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(async () => "created"),
  };
  const args = {
    operationId: "op-1",
    deviceId: "device-1",
    template: {
      remoteId: "template-1" as Id<"workoutTemplates"> | null,
      name: "Push",
      exercises: [{ slug: "bench", sets: [{ weight: 100, reps: 5 }] }],
    },
  };
  return { db, args, ctx: { db } as unknown as MutationCtx };
}

describe("template upload acknowledgments", () => {
  it("returns a completed operation without rewriting a newer server edit", async () => {
    const { db, ctx, args } = fixture({ receipt: true });
    args.template.name = "Old phone snapshot";
    expect(await handler(ctx, args)).toEqual({
      remoteTemplateId: "template-1",
      serverTime: 1234,
    });
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect a template deleted after the original upload", async () => {
    const { db, ctx, args } = fixture({ receipt: true, deleted: true });
    args.template.remoteId = null;
    expect((await handler(ctx, args)).remoteTemplateId).toBe("template-1");
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("rejects a target belonging to another account", async () => {
    const { db, ctx, args } = fixture({ receipt: true, owner: "other-user" });
    await expect(handler(ctx, args)).rejects.toThrow("Template not found");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("acknowledges a new operation with identical content without rewriting template rows", async () => {
    const { db, ctx, args } = fixture();
    await handler(ctx, args);
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledExactlyOnceWith(
      "iosSyncReceipts",
      expect.objectContaining({ targetId: "template-1", operationId: "op-1" }),
    );
  });

  it("still applies a real edit and records its receipt", async () => {
    const { db, ctx, args } = fixture();
    args.template.exercises[0].sets[0].weight = 150;
    await handler(ctx, args);
    expect(db.patch).toHaveBeenCalledWith(
      "template-1",
      expect.objectContaining({ name: "Push" }),
    );
    expect(db.delete).toHaveBeenCalledWith("exercise-1");
    expect(db.insert).toHaveBeenCalledWith(
      "templateExercises",
      expect.objectContaining({ sets: [{ weight: 150, reps: 5 }] }),
    );
    expect(db.insert).toHaveBeenCalledWith(
      "iosSyncReceipts",
      expect.objectContaining({ operationId: "op-1" }),
    );
  });
});
