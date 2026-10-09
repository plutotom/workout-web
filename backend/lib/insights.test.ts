import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getOverview, getSessionHistory, getExerciseRecords } from "./insights";

function context(sessions: Record<string, unknown>[]): QueryCtx {
  return {
    db: {
      query(table: string) {
        return {
          withIndex() {
            return this;
          },
          async collect() {
            return table === "workoutSessions" ? sessions : [];
          },
        };
      },
      async get() {
        return null;
      },
    },
  } as unknown as QueryCtx;
}

describe("note workout insights", () => {
  const userId = "user-1" as Id<"users">;
  it("loads a completed note into history and attendance without inventing lifts", async () => {
    const now = Date.now();
    const note = {
      _id: "note-1",
      startedAt: now - 60_000,
      completedAt: now,
      sessionKind: "tracked",
      inputMode: "note",
      noteUnit: "lb",
      noteBody: "  Bench 3 sets 10 @ 150\n",
      templateName: "Note workout",
    };
    const ctx = context([note]);
    const overview = await getOverview(ctx, userId, 7);
    expect(overview.stats).toMatchObject({
      workoutCount: 1,
      totalVolume: 0,
      weekStreak: 1,
    });
    expect(overview.setsBySlug).toEqual([]);
    expect(overview.topLifts).toEqual([]);
    expect(await getSessionHistory(ctx, userId, 7)).toMatchObject([
      {
        inputMode: "note",
        noteBody: note.noteBody,
        noteUnit: "lb",
        exercises: [],
        volume: 0,
      },
    ]);
    const records = await getExerciseRecords(ctx, userId, "bench-press");
    expect(records).toMatchObject({ est1RM: 0, bestWeight: 0, maxVolume: 0 });
  });

  it("filters completed blank notes and empty list workouts from attendance", async () => {
    const now = Date.now();
    const ctx = context([
      {
        _id: "blank",
        startedAt: now - 1000,
        completedAt: now,
        inputMode: "note",
        noteBody: " \n",
      },
      {
        _id: "list",
        startedAt: now - 1000,
        completedAt: now,
        noteBody: "Bench 10@150",
      },
    ]);
    expect((await getOverview(ctx, userId, 7)).stats.workoutCount).toBe(0);
    expect(await getSessionHistory(ctx, userId, 7)).toEqual([]);
  });
});
