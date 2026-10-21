import { createElement } from "react";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchHealthCoordinator } from "./watch-coordinator";
import { HealthExportCoordinator } from "./export-coordinator";
import { setHealthExportEnabled } from "@/data/local/repository";
import { refreshWatchSession } from "./watch-bridge";
import { migrateLocalDatabase } from "@/data/local/migrations";

const mocks = vi.hoisted(() => ({
  db: undefined,
  owner: "test-owner",
  events: [],
  refresh: vi.fn(),
  export: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
vi.mock("expo-sqlite", () => ({
  useSQLiteContext: () => mocks.db,
  openDatabaseAsync: vi.fn(),
}));
vi.mock("@/data/local/provider", () => ({
  useLocalData: () => ({ owner: mocks.owner, refresh: mocks.refresh }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove() {} }),
  },
}));
vi.mock("@/health", () => ({
  getHealthAdapter: () => ({
    isAvailable: async () => true,
    saveTrackedWorkout: mocks.export,
  }),
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => ({
    getSessionEvents: () => mocks.events,
    addListener: () => ({ remove() {} }),
  }),
}));

let renderer;
let sql;
let directory;
let file;
let failUuidWrite = false;
let transaction = Promise.resolve();
let id;
let sequence = 0;
async function open() {
  sql = new DatabaseSync(file);
  const binds = (values) =>
    values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
  const db = {
    execAsync: async (statement) => sql.exec(statement),
    runAsync: async (statement, ...values) => {
      if (
        failUuidWrite &&
        statement.includes("local_health_state") &&
        values[0] === `watch_health_uuid:${id}`
      ) {
        failUuidWrite = false;
        throw new Error("interrupted disk write");
      }
      return sql.prepare(statement).run(...binds(values));
    },
    getFirstAsync: async (statement, ...values) =>
      sql.prepare(statement).get(...binds(values)) ?? null,
    getAllAsync: async (statement, ...values) =>
      sql.prepare(statement).all(...binds(values)),
    withTransactionAsync: async (operation) => transact(operation),
    withExclusiveTransactionAsync: async (operation) =>
      transact(() => operation(db)),
  };
  function transact(operation) {
    const pending = transaction
      .catch(() => {})
      .then(async () => {
        sql.exec("BEGIN");
        try {
          const result = await operation();
          sql.exec("COMMIT");
          return result;
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        }
      });
    transaction = pending;
    return pending;
  }
  mocks.db = db;
  await migrateLocalDatabase(db);
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  id = `watch-workout-${++sequence}`;
  directory = mkdtempSync(join(tmpdir(), "watch-health-replay-"));
  file = join(directory, "account.db");
  mocks.events = [];
  mocks.owner = "test-owner";
  mocks.refresh.mockClear();
  mocks.export.mockReset().mockResolvedValue({ uuid: "phone-health-export" });
  failUuidWrite = false;
  transaction = Promise.resolve();
  await open();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  await settle();
  sql.close();
  rmSync(directory, { recursive: true, force: true });
});
function seed(status = "completed") {
  sql
    .prepare(
      "INSERT INTO local_sessions (id, template_name, status, started_at, completed_at, updated_at) VALUES (?, 'Test workout', ?, 100, ?, 200)",
    )
    .run(id, status, status === "completed" ? 200 : null);
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
}
async function mount() {
  await act(async () => {
    renderer = create(createElement(WatchHealthCoordinator));
  });
  refreshWatchSession();
  await settle();
}
const row = () =>
  sql
    .prepare(
      "SELECT external_id, health_export_pending, updated_at FROM local_sessions WHERE id = ?",
    )
    .get(id);
function events() {
  return [
    { type: "state", sessionId: id, status: "recording", reachable: true },
    { type: "ended", sessionId: id, healthUuid: `health-${id}` },
  ];
}

describe("Watch Health acknowledgements with file-backed SQLite", () => {
  it.each(["starting", "recording"])(
    "uses native evidence to prevent a racing phone export before SQLite adoption (%s)",
    async (status) => {
      seed();
      await setHealthExportEnabled(mocks.db, true);
      sql
        .prepare(
          "UPDATE local_sessions SET health_export_pending = 1 WHERE id = ?",
        )
        .run(id);
      mocks.events = [
        { type: "state", sessionId: id, status, reachable: true },
      ];
      refreshWatchSession();
      await act(async () => {
        renderer = create(createElement(HealthExportCoordinator));
      });
      await settle();
      expect(mocks.export).not.toHaveBeenCalled();
      expect(row().external_id).toBeNull();
    },
  );

  it("allows a phone export once native state confirms a failed start", async () => {
    seed();
    await setHealthExportEnabled(mocks.db, true);
    sql
      .prepare(
        "UPDATE local_sessions SET health_export_pending = 1 WHERE id = ?",
      )
      .run(id);
    mocks.events = [
      { type: "state", sessionId: id, status: "starting", reachable: true },
    ];
    refreshWatchSession();
    mocks.events = [
      { type: "state", sessionId: id, status: "idle", reachable: true },
    ];
    refreshWatchSession();
    await act(async () => {
      renderer = create(createElement(HealthExportCoordinator));
    });
    await settle();
    expect(mocks.export).toHaveBeenCalledTimes(1);
    expect(row().external_id).toBe("phone-health-export");
  });
  it("replays once after restart, attaches the Health identity, and creates no second export", async () => {
    seed();
    mocks.events = events();
    await mount();
    expect(row().external_id).toBe(`health-${id}`);
    expect(row().health_export_pending).toBe(0);
    const updated = row().updated_at;
    refreshWatchSession();
    await settle();
    expect(row().updated_at).toBe(updated);
    await act(async () => renderer.unmount());
    renderer = undefined;
    sql.close();
    await open();
    await mount();
    expect(row().external_id).toBe(`health-${id}`);
    expect(row().updated_at).toBe(updated);
    expect(
      sql.prepare("SELECT COUNT(*) AS count FROM local_sessions").get().count,
    ).toBe(1);
  });
  it("does not adopt another account's durable native events", async () => {
    mocks.owner = "other-test-owner";
    mocks.events = events();
    await mount();
    expect(
      sql
        .prepare("SELECT * FROM local_health_state WHERE key LIKE 'watch_%'")
        .all(),
    ).toEqual([]);
    expect(
      sql.prepare("SELECT COUNT(*) AS count FROM local_sessions").get().count,
    ).toBe(0);
  });
  it("retains a failed UUID acknowledgement for retry from native replay", async () => {
    seed();
    mocks.events = events();
    failUuidWrite = true;
    await mount();
    // Initial replay may already have retried once; repeated replay is idempotent.
    refreshWatchSession();
    await settle();
    expect(row().external_id).toBe(`health-${id}`);
    expect(row().health_export_pending).toBe(0);
  });
  it("keeps a UUID received before Finish until completion can adopt it", async () => {
    seed("in_progress");
    mocks.events = events();
    await mount();
    expect(row().external_id).toBeNull();
    expect(
      sql
        .prepare("SELECT value FROM local_health_state WHERE key = ?")
        .get(`watch_health_uuid:${id}`).value,
    ).toBe(`health-${id}`);
    sql
      .prepare(
        "UPDATE local_sessions SET status = 'completed', completed_at = 200 WHERE id = ?",
      )
      .run(id);
    refreshWatchSession();
    await settle();
    expect(row().external_id).toBe(`health-${id}`);
    expect(row().health_export_pending).toBe(0);
  });
});
