import { describe, expect, it } from "vitest";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  isTransientDatabaseError,
  runDatabaseWrite,
  serializeDatabaseWrites,
  userFacingDatabaseError,
  withWorkoutTransaction,
} from "./workout-transactions";

function sqliteLocked() {
  return new Error(
    "FunctionCallException: Calling the 'finalizeAsync' function has failed (at ExpoModulesCore/AsyncFunctionDefinition.swift:123) -> Caused by: SQLiteErrorException: Error code 5: database is locked (at ExpoSQLite/SQLiteModule.swift:471)",
  );
}

function mockDatabase(
  exclusive: SQLiteDatabase["withExclusiveTransactionAsync"],
  run: SQLiteDatabase["runAsync"] = async () => ({
    changes: 0,
    lastInsertRowId: 0,
  }),
) {
  return {
    withExclusiveTransactionAsync: exclusive,
    runAsync: run,
  } as SQLiteDatabase;
}

describe("sqlite error surfacing", () => {
  it("treats Expo finalize/lock failures as transient", () => {
    expect(isTransientDatabaseError(sqliteLocked())).toBe(true);
    expect(isTransientDatabaseError(new Error("disk full"))).toBe(false);
  });

  it("hides raw SQLite text from the user", () => {
    const fallback = "Couldn’t save this set. Try again.";
    expect(userFacingDatabaseError(sqliteLocked(), fallback)).toBe(fallback);
    expect(userFacingDatabaseError(new Error("disk full"), fallback)).toBe(
      "disk full",
    );
  });
});

describe("serialized database writes", () => {
  it("makes overlapping exclusive transactions wait instead of locking", async () => {
    const events: string[] = [];
    let holders = 0;
    const db = mockDatabase(async (operation) => {
      if (holders > 0) throw sqliteLocked();
      holders += 1;
      events.push("start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      await operation(db);
      holders -= 1;
      events.push("end");
    });
    serializeDatabaseWrites(db);
    await Promise.all([
      db.withExclusiveTransactionAsync(async () => {
        events.push("a");
      }),
      db.withExclusiveTransactionAsync(async () => {
        events.push("b");
      }),
    ]);
    expect(events).toEqual(["start", "a", "end", "start", "b", "end"]);
  });

  it("retries a locked exclusive write instead of dropping it", async () => {
    let attempts = 0;
    let saved = false;
    const db = mockDatabase(async (operation) => {
      attempts += 1;
      if (attempts === 1) throw sqliteLocked();
      await operation(db);
      saved = true;
    });
    await withWorkoutTransaction(db, async () => {
      saved = true;
    });
    expect(attempts).toBe(2);
    expect(saved).toBe(true);
  });

  it("queues a standalone outbox write behind an exclusive workout save", async () => {
    const events: string[] = [];
    const db = mockDatabase(
      async (operation) => {
        events.push("exclusive-start");
        await new Promise((resolve) => setTimeout(resolve, 20));
        await operation(db);
        events.push("exclusive-end");
      },
      async () => {
        events.push("run");
        return { changes: 1, lastInsertRowId: 0 };
      },
    );
    serializeDatabaseWrites(db);
    await Promise.all([
      db.withExclusiveTransactionAsync(async () => {
        events.push("save-set");
      }),
      runDatabaseWrite(db, () =>
        db.runAsync("UPDATE local_sync_outbox SET attempt_count = 1"),
      ),
    ]);
    expect(events).toEqual([
      "exclusive-start",
      "save-set",
      "exclusive-end",
      "run",
    ]);
  });
});
