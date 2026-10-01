import { expect, it, vi } from "vitest";

import { assembleAccountBackup } from "../../../src/lib/account-backup";
import { parseBackup, serializeBackup } from "../../../src/lib/workout-backup";
import type { BackupSession } from "../../../src/lib/workout-backup";
import type { QueryCtx } from "../../_generated/server";
import { sessionsPage } from "./queries";

vi.mock("../../lib/auth", () => ({ getUser: async () => ({ _id: "user-1" }) }));

it("exports exact note fields in an account history page that iOS can restore", async () => {
  const noteBody = "  Bench 10@150\n\nPull up, 10, 9, 9\n";
  const ctx = {
    db: {
      query() {
        return {
          withIndex() {
            return this;
          },
          order() {
            return this;
          },
          async take() {
            return [];
          },
          async paginate() {
            return {
              page: [
                {
                  _id: "note-1",
                  status: "completed",
                  sessionKind: "tracked",
                  inputMode: "note",
                  noteBody,
                  noteUnit: "kg",
                  startedAt: 100,
                  completedAt: 200,
                },
              ],
              isDone: true,
              continueCursor: "",
            };
          },
        };
      },
    },
  } as unknown as QueryCtx;
  const handler = (
    sessionsPage as unknown as {
      _handler: (
        ctx: QueryCtx,
        args: { paginationOpts: { numItems: number; cursor: null } },
      ) => Promise<{
        page: BackupSession[];
        isDone: boolean;
        continueCursor: string;
      } | null>;
    }
  )._handler;
  const result = await handler(ctx, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(result?.page[0]).toMatchObject({
    inputMode: "note",
    noteBody,
    noteUnit: "kg",
    exercises: [],
  });
  const backup = assembleAccountBackup(
    {
      createdAt: 300,
      preferences: {
        unit: "lb",
        barWeightLb: 45,
        barWeightKg: 20,
        activeWorkoutMode: "list",
        restTimerEnabled: true,
        restTimerNotificationsEnabled: true,
        appleHealthImportNotificationsEnabled: false,
      },
      customExercises: [],
      templates: [],
      exerciseNotes: [],
    },
    result!.page,
  );
  const parsed = parseBackup(serializeBackup(backup));
  expect(parsed.ok).toBe(true);
  if (parsed.ok)
    expect(parsed.snapshot.sessions[0]).toMatchObject({
      inputMode: "note",
      noteBody,
      noteUnit: "kg",
      exercises: [],
    });
});
