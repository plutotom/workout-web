import type { SQLiteDatabase } from "expo-sqlite";
import { describe, expect, it } from "vitest";

import { migrateLocalDatabase } from "./migrations";

function databaseAtVersion(version: number) {
  const executedSql: string[] = [];
  let transactionCount = 0;

  const db = {
    execAsync: async (sql: string) => {
      executedSql.push(sql);
    },
    getFirstAsync: async () => ({ user_version: version }),
    withTransactionAsync: async (operation: () => Promise<void>) => {
      transactionCount += 1;
      await operation();
    },
  } as unknown as SQLiteDatabase;

  return {
    db,
    executedSql,
    get transactionCount() {
      return transactionCount;
    },
  };
}

describe("migrateLocalDatabase", () => {
  it("accepts an existing version 7 database", async () => {
    const fixture = databaseAtVersion(7);

    await expect(migrateLocalDatabase(fixture.db)).resolves.toBeUndefined();

    expect(fixture.transactionCount).toBe(0);
    expect(fixture.executedSql).toEqual([
      "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
    ]);
  });

  it("upgrades a version 5 database with the shipped version 6 schema", async () => {
    const fixture = databaseAtVersion(5);

    await migrateLocalDatabase(fixture.db);

    expect(fixture.transactionCount).toBe(1);
    expect(fixture.executedSql).toHaveLength(3);
    expect(fixture.executedSql[1]).toContain(
      "ALTER TABLE local_sessions ADD COLUMN health_segments_json TEXT;",
    );
    expect(fixture.executedSql[1]).toContain("PRAGMA user_version = 6;");
    expect(fixture.executedSql[2]).toContain(
      "ALTER TABLE local_templates ADD COLUMN last_place_id TEXT;",
    );
    expect(fixture.executedSql[2]).toContain("PRAGMA user_version = 7;");
  });

  it("upgrades a version 6 database with the places schema", async () => {
    const fixture = databaseAtVersion(6);

    await migrateLocalDatabase(fixture.db);

    expect(fixture.transactionCount).toBe(1);
    expect(fixture.executedSql).toHaveLength(2);
    expect(fixture.executedSql[1]).toContain(
      "ALTER TABLE local_sessions ADD COLUMN place_id TEXT;",
    );
    expect(fixture.executedSql[1]).not.toContain("health_segments_json");
    expect(fixture.executedSql[1]).toContain("PRAGMA user_version = 7;");
  });

  it("still rejects databases newer than the supported schema", async () => {
    const fixture = databaseAtVersion(8);

    await expect(migrateLocalDatabase(fixture.db)).rejects.toThrow(
      "Workout database version 8 is newer than this app supports",
    );
  });
});
