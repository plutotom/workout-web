import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { WatchCompanionCard } from "./watch-companion-card";
import { WatchHealthCoordinator } from "./watch-coordinator";
import { HealthExportCoordinator } from "./export-coordinator";
import { migrateLocalDatabase } from "@/data/local/migrations";
import {
  isWatchStartPending,
  listPendingHealthExports,
  setHealthExportEnabled,
} from "@/data/local/repository";

const ui = vi.hoisted(() => ({
  listener: undefined,
  retry: vi.fn(),
  end: vi.fn(),
  db: undefined,
  export: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => ui.db }));
vi.mock("@/data/local/provider", () => ({
  useLocalPreferences: () => ({ autoStartWatchWorkout: false }),
  useLocalData: () => ({
    owner: "test-native-watch-owner",
    refresh: ui.refresh,
  }),
}));
vi.mock("@/health", () => ({
  getHealthAdapter: () => ({
    isAvailable: async () => true,
    requestWriteAccess: async () => "connected",
    saveTrackedWorkout: (...args) => ui.export(...args),
  }),
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => ({
    getStatus: () => ({
      supported: true,
      paired: true,
      installed: true,
      reachable: true,
    }),
    getSessionEvents: () => [],
    requestWatchStatus() {},
    retryWatchSession: (...args) => ui.retry(...args),
    endWatchSession: (...args) => ui.end(...args),
    startWatchWorkout: async () => {},
    addListener: (_name, listener) => {
      ui.listener = listener;
      return { remove() {} };
    },
  }),
}));
vi.mock("@/components/ui", async () => {
  const { createElement } = await import("react");
  return {
    Card: "Card",
    Button: ({ label, ...props }) => createElement("Button", props, label),
  };
});
vi.mock("lucide-react-native", () => ({ Watch: "Watch" }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove() {} }),
  },
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));

const mobileRoot = resolve(import.meta.dirname, "../..");
const swiftAvailable =
  process.platform === "darwin" &&
  spawnSync("xcrun", ["--find", "swiftc"]).status === 0;

describe.skipIf(!swiftAvailable)("Watch native closing lifecycle", () => {
  let directory;
  let executable;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "workout-watch-closing-"));
    executable = join(directory, "watch-closing");
    const source = readFileSync(
      join(mobileRoot, "targets/watch/WorkoutManager.swift"),
      "utf8",
    );
    const start = source.indexOf("  func endFromPhone(");
    const end = source.indexOf("  private func requestAuthorization(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    function method(signature) {
      const begin = source.indexOf(signature);
      if (begin < 0) throw new Error(`Missing production method: ${signature}`);
      let finish = source.indexOf("{", begin),
        depth = 1;
      while (depth && ++finish < source.length) {
        if (source[finish] === "{") depth++;
        if (source[finish] === "}") depth--;
      }
      if (depth) throw new Error("Unclosed production method");
      return source.slice(begin, finish + 1);
    }
    const opening = [
      "  func recoverIfNeeded(",
      "  func retryWorkoutOperation(",
      "  func retryFromPhone(",
      "  func startFromPhone(",
      "  func replyToStatus(",
      "  private func start(",
      "  private func attach(",
    ]
      .map(method)
      .join("\n");
    const harness = readFileSync(
      join(mobileRoot, "tests/watch-closing-harness.swift"),
      "utf8",
    )
      .replace("  // WORKOUT_MANAGER_CLOSING_METHODS", source.slice(start, end))
      .replace("  // WORKOUT_MANAGER_OPENING_METHODS", opening);
    const harnessPath = join(directory, "main.swift");
    writeFileSync(harnessPath, harness);
    execFileSync(
      "xcrun",
      [
        "swiftc",
        join(mobileRoot, "targets/watch/SessionIdentity.swift"),
        harnessPath,
        "-o",
        executable,
      ],
      {
        encoding: "utf8",
        timeout: 30_000,
      },
    );
  }, 35_000);

  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  function run(scenario) {
    return JSON.parse(
      execFileSync(executable, [scenario], {
        encoding: "utf8",
        timeout: 5_000,
      }),
    );
  }

  it("does not end a different workout when an old command is delivered", () => {
    expect(run("foreign-end")).toMatchObject({
      saves: 0,
      discards: 0,
      endCalls: 0,
      healthSessions: ["old-session"],
    });
  });

  it("rejects a queued start when Finish arrives before Start", () => {
    expect(run("finish-before-start")).toMatchObject({
      saves: 0,
      endCalls: 0,
      lateStartAllowed: false,
    });
  });

  it.each([
    "discard-then-end",
    "discard-during-collection",
    "discard-after-collection-callback",
    "repeated-discard",
  ])("discards without saving for %s", (scenario) => {
    const result = run(scenario);
    expect(result).toMatchObject({
      saves: 0,
      discards: 1,
      released: true,
    });
    expect(result.healthUuids.length).toBeGreaterThan(0);
    expect(result.healthUuids.every((uuid) => uuid === "")).toBe(true);
  });

  it.each([
    "recovery-discard",
    "recovery-finish",
    "recovery-error",
    "recovery-crash",
  ])("defers closure until recovery resolves (%s)", (scenario) => {
    const result = run(scenario);
    expect(result).toMatchObject({
      ackBeforeRecovery: false,
      endCalls: 1,
      released: true,
    });
    expect(result.saves).toBe(scenario === "recovery-finish" ? 1 : 0);
    expect(result.discards).toBe(scenario === "recovery-finish" ? 0 : 1);
    if (scenario === "recovery-error")
      expect(result).toMatchObject({
        ackAfterError: false,
        recoveryErrorVisible: true,
        recoveryCalls: 2,
      });
    else expect(result.recoveryCalls).toBe(1);
  });
  it.each(["start-during-finalization", "stale-save-callback"])(
    "retains ownership and rejects obsolete callbacks (%s)",
    (scenario) => {
      expect(run(scenario)).toMatchObject({
        oldRetainedWhileClosing: true,
        saves: 1,
        savedCount: 1,
        newSessionId: "next-session",
        newSaves: 0,
        newRetained: true,
      });
    },
  );
  it("ignores an obsolete collection callback after an explicit retry", () => {
    expect(run("stale-collection-retry")).toMatchObject({
      savesBeforeCurrentCallback: 0,
      collections: 2,
      savedCount: 1,
      released: true,
    });
  });
  it("resolves a recovery retry with no active workout to idle", () => {
    expect(run("recovery-no-active-after-error")).toMatchObject({
      status: "idle",
      errorCleared: true,
    });
  });
  it("coalesces starts until recovery and applies an intervening close first", () => {
    expect(run("recovery-start-and-close")).toMatchObject({
      queuedStartCount: 1,
      createdBeforeRecovery: false,
      saves: 0,
      status: "idle",
      lateStartAllowed: false,
    });
  });
  it.each(["interrupted-ending", "interrupted-collection", "interrupted-save"])(
    "preserves unresolved finalization after process death (%s)",
    (scenario) => {
      expect(run(scenario)).toMatchObject({
        journalBeforeSessionEnd: true,
        finalizationRetained: true,
        pendingCloseCount: 1,
        errorVisible: true,
        status: "saveFailed",
        healthUuids: [],
        lateStartAllowed: true,
      });
    },
  );
  it("reconciles a Health commit whose completion callback was lost", () => {
    const result = run("interrupted-committed");
    expect(result).toMatchObject({
      journalBeforeSessionEnd: true,
      finalizationRetained: false,
      pendingCloseCount: 0,
      status: "ended",
      healthSaved: [true],
      remainingHealthWorkouts: 1,
    });
    expect(result.healthUuids[0]).not.toBe("");
  });
  it("retains a Discard through interrupted saving and deletes the reconciled Health workout", () => {
    expect(run("interrupted-discard")).toMatchObject({
      finalizationRetained: false,
      pendingCloseCount: 0,
      status: "idle",
      healthSaved: [false],
      remainingHealthWorkouts: 0,
      healthDeleteCalls: 1,
    });
  });
  it.each(["discard-in-save", "discard-locked-save", "discard-delete-retry"])(
    "keeps Discard through save completion and deferred deletion (%s)",
    (scenario) => {
      const result = run(scenario);
      expect(result).toMatchObject({
        saveWasInFlight: true,
        saves: 1,
        savedCount: 1,
        remainingHealthWorkouts: 0,
        healthSaved: [false],
        finalizationRetained: false,
        status: "idle",
      });
      if (scenario !== "discard-in-save")
        expect(result).toMatchObject({
          ackBeforeRetry: false,
          discardRetainedBeforeRetry: true,
        });
    },
  );
  it.each(["phone-recovery-retry", "phone-journal-recovery-retry"])(
    "routes the iPhone retry through recovery without leaving it stuck (%s)",
    (scenario) => {
      const result = run(scenario);
      expect(result).toMatchObject({
        recoveryCallsFromPhone: 1,
        status: "saveFailed",
        healthUuids: [],
      });
      expect(result.statesAfterRetry).toContain("saveFailed");
    },
  );
  it("keeps an unknown commit phase across Health query errors and reconciles on retry", () => {
    expect(run("reconcile-query-retry")).toMatchObject({
      ackBeforeRetry: false,
      phaseAfterQueryError: "saving",
      healthSaved: [true],
      finalizationRetained: false,
      remainingHealthWorkouts: 1,
      status: "ended",
    });
  });
  it("checks sync metadata before committing a workout and allows explicit retry", () => {
    expect(run("metadata-retry")).toMatchObject({
      savesBeforeRetry: 0,
      savedCount: 1,
      collections: 1,
      status: "ended",
    });
  });
  it("limits reconciliation/deletion to this Watch source and exact session metadata", () => {
    expect(run("reconcile-source-scope")).toMatchObject({
      foreignPreserved: true,
      differentPreserved: true,
      remainingHealthWorkouts: 2,
      healthDeleteCalls: 1,
      healthSaved: [false],
    });
  });
  it("replays successful deletion with a lost callback without reading a deleted object", () => {
    expect(run("delete-callback-lost")).toMatchObject({
      phaseBeforeRestart: "deleting",
      ackBeforeRestart: false,
      deleteReplayCounts: [0],
      queryCount: 0,
      newSessionId: "next-session",
      remainingHealthWorkouts: 0,
      finalizationRetained: false,
      healthSaved: [false],
    });
  });
  it.each(["recovery-error-scoped", "recovery-error-no-context"])(
    "reports retryable cold-start recovery errors to the waiting phone (%s)",
    (scenario) => {
      expect(run(scenario)).toMatchObject({
        failureWasScoped: true,
        recoveryGateRetained: true,
        closureRetained: true,
        recoveryCalls: 2,
        status: "recoveryFailed",
        healthUuids: [],
      });
    },
  );
  it.each(["recovery-end-date", "recovery-end-date-retry"])(
    "preserves original End time with a surviving session (%s)",
    (scenario) => {
      expect(run(scenario)).toMatchObject({
        recoveredEndDate: 200,
        savedCount: 1,
        status: "ended",
      });
    },
  );
  it("retries a failed startup recovery without replacing queued Start with End", () => {
    expect(run("recovery-start-error-retry")).toMatchObject({
      startedAfterRetry: true,
      pendingCloseCount: 0,
      healthUuids: [],
    });
  });
  it("ignores delayed same-session retries once recovery resumed recording", () => {
    expect(run("recovery-delayed-retry")).toMatchObject({
      startedAfterRetry: true,
      endCalls: 0,
      collections: 0,
      saves: 0,
      pendingCloseCount: 0,
      finalizationRetained: false,
      status: "recording",
    });
  });
  it("does not end or retry a different session when Retry is delayed", () => {
    expect(run("retry-foreign-session")).toMatchObject({
      endCalls: 0,
      collections: 0,
      saves: 0,
    });
  });
  it.each(["queued-start-status", "queued-start-retry"])(
    "keeps queued-start ownership in production native replies (%s)",
    (scenario) => {
      const result = run(scenario);
      expect(result).toMatchObject({
        queuedStartCount: 1,
        startedQueuedWorkout: true,
      });
      for (const events of [result.recoveryEvents, result.queuedReplyEvents]) {
        const replies = events.filter(
          (event) => event.sessionId === "next-session",
        );
        expect(replies.length).toBeGreaterThan(0);
        expect(
          replies.every((event) =>
            ["recovering", "starting"].includes(event.status),
          ),
        ).toBe(true);
      }
    },
  );
  it("preserves terminal-result precedence over a queued Start", () => {
    const result = run("queued-start-terminal");
    expect(result.startedQueuedWorkout).toBe(false);
    expect(
      result.queuedReplyEvents.filter(
        (event) => event.sessionId === "next-session",
      ),
    ).toEqual([
      {
        type: "ended",
        sessionId: "next-session",
        healthUuid: "",
        healthSaved: false,
      },
      {
        type: "ended",
        sessionId: "next-session",
        healthUuid: "",
        healthSaved: false,
      },
    ]);
  });
  it.each(["queued-start-status", "queued-start-retry"])(
    "suppresses phone export through real Swift replies, bridge, coordinators and SQLite (%s)",
    async (scenario) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const native = run(scenario);
      const sql = new DatabaseSync(join(directory, `${scenario}.db`));
      const binds = (values) =>
        values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
      let transaction = Promise.resolve();
      const transact = (operation) => {
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
      };
      const db = {
        execAsync: async (statement) => sql.exec(statement),
        runAsync: async (statement, ...values) =>
          sql.prepare(statement).run(...binds(values)),
        getFirstAsync: async (statement, ...values) =>
          sql.prepare(statement).get(...binds(values)) ?? null,
        getAllAsync: async (statement, ...values) =>
          sql.prepare(statement).all(...binds(values)),
        withTransactionAsync: transact,
        withExclusiveTransactionAsync: (operation) =>
          transact(() => operation(db)),
      };
      ui.db = db;
      ui.export
        .mockReset()
        .mockResolvedValue({ uuid: "unexpected-phone-export" });
      await migrateLocalDatabase(db);
      await setHealthExportEnabled(db, true);
      sql
        .prepare(
          "INSERT INTO local_sessions (id, template_name, status, started_at, completed_at, updated_at) VALUES ('next-session', 'Queued workout', 'completed', 100, 200, 200)",
        )
        .run();
      let coordinator, exporter;
      try {
        await act(async () => {
          coordinator = create(createElement(WatchHealthCoordinator));
        });
        // Deliver recovery, then later Status/duplicate Retry before delayed End.
        for (const payload of [
          ...native.recoveryEvents,
          ...native.queuedReplyEvents,
        ]) {
          await act(async () => {
            ui.listener(payload);
            await new Promise((resolve) => setImmediate(resolve));
          });
        }
        expect(await isWatchStartPending(db, "next-session")).toBe(true);
        expect(await listPendingHealthExports(db)).toHaveLength(0);
        await act(async () => {
          exporter = create(createElement(HealthExportCoordinator));
        });
        await act(async () => {
          await new Promise((resolve) => setImmediate(resolve));
        });
        expect(ui.export).not.toHaveBeenCalled();
        expect(
          sql
            .prepare(
              "SELECT external_id FROM local_sessions WHERE id = 'next-session'",
            )
            .get().external_id,
        ).toBeNull();
      } finally {
        await act(async () => {
          exporter?.unmount();
          coordinator?.unmount();
        });
        await transaction.catch(() => {});
        sql.close();
        ui.db = undefined;
      }
    },
  );
  it.each([
    "recovery-idle-context",
    "recovery-idle-request-only",
    "recovery-idle-multiple",
  ])("returns scoped idle for resolved recovery requests (%s)", (scenario) => {
    const result = run(scenario);
    expect(result).toMatchObject({ status: "idle", remainingReplyIds: 0 });
    expect(result.afterRetryEvents).toContainEqual({
      type: "state",
      sessionId: "test-session",
      status: "idle",
      reachable: true,
    });
    if (scenario === "recovery-idle-multiple")
      expect(result.afterRetryEvents).toContainEqual({
        type: "state",
        sessionId: "other-session",
        status: "idle",
        reachable: true,
      });
  });
  it("restores the phone Start control using the actual production Swift idle payload", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    ui.retry.mockReset().mockResolvedValue(undefined);
    ui.end.mockClear();
    const native = run("recovery-idle-context");
    let renderer;
    try {
      await act(async () => {
        renderer = create(
          createElement(WatchCompanionCard, {
            sessionId: "test-session",
            startedAt: 1000,
          }),
        );
      });
      for (const payload of native.beforeRetryEvents)
        await act(async () => ui.listener(payload));
      const retry = renderer.root.find(
        (node) =>
          String(node.type) === "Button" &&
          node.children.join("") === "Retry Watch recovery",
      );
      await act(async () => retry.props.onPress());
      expect(JSON.stringify(renderer.toJSON())).toContain(
        "Retrying Watch recovery…",
      );
      for (const payload of native.afterRetryEvents)
        await act(async () => ui.listener(payload));
      expect(JSON.stringify(renderer.toJSON())).not.toContain(
        "Retrying Watch recovery…",
      );
      const start = renderer.root.find(
        (node) =>
          String(node.type) === "Pressable" &&
          node.props.accessibilityLabel === "Start on Apple Watch",
      );
      expect(start.props.disabled).toBe(false);
      expect(ui.end).not.toHaveBeenCalled();
    } finally {
      if (renderer) await act(async () => renderer.unmount());
    }
  });
  it("keeps a failed Health save retryable without a false terminal acknowledgement", () => {
    expect(run("save-failure")).toMatchObject({
      failedStatus: "saveFailed",
      failureVisible: true,
      endedBeforeRetry: false,
      released: false,
      savedCount: 0,
      healthUuids: [],
      lateStartAllowed: true,
    });
  });
  it("retries the same builder after save failure without ending collection again", () => {
    expect(run("save-retry")).toMatchObject({
      endedBeforeRetry: false,
      collections: 1,
      saves: 2,
      savedCount: 1,
      newSessionId: "next-session",
    });
  });
  it("permits explicit discard after a failed save", () => {
    expect(run("discard-save-failure")).toMatchObject({
      savedCount: 0,
      discards: 1,
      released: true,
      healthSaved: [false],
    });
  });
  it("does not call finishWorkout when endCollection fails", () => {
    expect(run("collection-failure")).toMatchObject({
      failedStatus: "saveFailed",
      failureVisible: true,
      saves: 0,
      released: false,
      healthUuids: [],
    });
  });
  it("retries failed collection with the original end date", () => {
    expect(run("collection-retry")).toMatchObject({
      collections: 2,
      savesBeforeRetry: 0,
      savedCount: 1,
      sameEndDate: true,
      released: true,
    });
  });
  it("replays successful locked-device saves separately from a discard", () => {
    expect(run("locked-success")).toMatchObject({
      savedCount: 1,
      savedMarker: true,
      status: "ended",
      released: true,
      healthUuids: ["", ""],
      healthSaved: [true, true],
    });
  });
  it("retains a visible failed-save journal when the ended builder cannot be recovered", () => {
    expect(run("recovery-lost-failed-builder")).toMatchObject({
      failureVisible: true,
      failedStatus: "saveFailed",
      ackBeforeDiscard: false,
      healthSaved: [false],
      status: "idle",
    });
  });
  it.each(["normal-end", "repeated-end"])(
    "saves exactly once for %s",
    (scenario) => {
      const result = run(scenario);
      expect(result).toMatchObject({
        saves: 1,
        discards: 0,
        collections: 1,
        released: true,
      });
      expect(result.healthUuids).toHaveLength(1);
      expect(result.healthUuids[0]).not.toBe("");
    },
  );
});
