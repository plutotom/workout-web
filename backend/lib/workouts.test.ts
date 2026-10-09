import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getWorkout } from "./workouts";

describe("remote workout exercise notes", () => {
  it.each([
    [
      "Set 1: failed attempt after 4 completed reps.",
      "Set 1: failed attempt after 4 completed reps.",
    ],
    ["", ""],
    [undefined, "Global lift note"],
  ])(
    "prefers the saved session note %j over global notes",
    async (sessionNote, expected) => {
      const userId = "user-1" as Id<"users">;
      const sessionId = "session-1" as Id<"workoutSessions">;
      const ctx = {
        db: {
          async get() {
            return {
              _id: sessionId,
              userId,
              status: "completed",
              startedAt: 100,
            };
          },
          query(table: string) {
            return {
              withIndex() {
                return this;
              },
              async collect() {
                return table === "sessionExercises"
                  ? [
                      {
                        _id: "lift-1",
                        exerciseSlug: "deadlift",
                        orderIndex: 0,
                        notes: sessionNote,
                      },
                    ]
                  : [];
              },
              async unique() {
                return { notes: "Global lift note" };
              },
            };
          },
        },
      } as unknown as QueryCtx;
      const workout = await getWorkout(ctx, userId, sessionId);
      expect(workout?.exercises[0].notes).toBe(expected);
    },
  );
});
