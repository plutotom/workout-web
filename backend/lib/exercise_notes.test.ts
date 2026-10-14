import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { upsertExerciseNote } from "./exercise_notes";

function fixture(existing: { _id: string; notes: string } | null = null) {
  const patch = vi.fn(async () => {});
  const insert = vi.fn(async () => "note-1");
  const remove = vi.fn(async () => {});
  const ctx = {
    db: {
      query: () => ({
        withIndex() {
          return this;
        },
        unique: async () => existing,
      }),
      patch,
      insert,
      delete: remove,
    },
  } as unknown as MutationCtx;
  return { ctx, patch, insert, remove };
}
const user = "user-1" as Id<"users">;

describe("exercise note storage", () => {
  it.each([600, 10_000])(
    "stores the complete %s-character note",
    async (length) => {
      const { ctx, insert } = fixture();
      const note = "x".repeat(length);
      await upsertExerciseNote(ctx, user, "bench-press", note);
      expect(insert).toHaveBeenCalledWith("exerciseNotes", {
        userId: user,
        exerciseSlug: "bench-press",
        notes: note,
      });
    },
  );
  it("rejects an oversized replacement without changing the saved note", async () => {
    const { ctx, patch, insert, remove } = fixture({
      _id: "note-1",
      notes: "original",
    });
    await expect(
      upsertExerciseNote(ctx, user, "bench-press", "x".repeat(10_001)),
    ).rejects.toThrow("10000 characters");
    expect(patch).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it("still clears a saved note when its text is empty", async () => {
    const { ctx, remove } = fixture({ _id: "note-1", notes: "original" });
    await upsertExerciseNote(ctx, user, "bench-press", " \n");
    expect(remove).toHaveBeenCalledWith("note-1");
  });
});
