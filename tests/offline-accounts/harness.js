import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { setImmediate as nextTurn } from "node:timers/promises";
import { getFunctionName } from "convex/server";
import { convexTest } from "convex-test";
import { act, create } from "react-test-renderer";
import React from "react";
import { expect, vi } from "vitest";

// Mock native boundaries only. Auth, provider, migrations, repository, worker,
// coordinator, backend handlers, validators and account authorization stay real.
const native = vi.hoisted(() => ({
  phone: null,
  appState: "active",
  listeners: new Set(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
vi.mock("expo-sqlite", async () => {
  const React = await import("react");
  const context = React.createContext(null);
  return {
    openDatabaseAsync: async (name) => native.phone.database(name).db,
    backupDatabaseAsync: async ({ sourceDatabase, destDatabase }) =>
      backup(
        sourceDatabase.testSql,
        destDatabase.testSql.prepare("PRAGMA database_list").get().file,
      ),
    SQLiteProvider: ({ children, databaseName, onInit }) => {
      const phone = native.phone;
      const record = React.useMemo(
        () => phone.database(databaseName),
        [phone, databaseName],
      );
      const [initialized, setInitialized] = React.useState(null);
      React.useEffect(() => {
        let active = true;
        void onInit(record.db).then(() => {
          if (active) setInitialized(record);
        });
        return () => {
          active = false;
        };
      }, [record, onInit]);
      if (initialized !== record) return null;
      phone.databaseName = databaseName;
      phone.sql = record.sql;
      phone.db = record.db;
      return React.createElement(
        context.Provider,
        { value: record.db },
        children,
      );
    },
    useSQLiteContext: () => React.useContext(context),
  };
});
vi.mock("react-native", () => ({
  Alert: { alert: (...args) => native.phone.alerts.push(args) },
  AppState: {
    get currentState() {
      return native.appState;
    },
    addEventListener: (_event, listener) => {
      native.listeners.add(listener);
      return { remove: () => native.listeners.delete(listener) };
    },
  },
}));
vi.mock("@/health/watch-bridge", () => ({
  endWatchWorkout: async () => null,
  discardWatchWorkout: async () => null,
}));
vi.mock("@/auth/auth-provider", async () => {
  const React = await import("react");
  return {
    useAuthCredentials: () => {
      const phone = native.phone;
      const state = React.useSyncExternalStore(
        phone.auth.subscribe,
        phone.auth.getSnapshot,
      );
      return state;
    },
    useMobileAuth: () => {
      const phone = native.phone;
      const state = React.useSyncExternalStore(
        phone.auth.subscribe,
        phone.auth.getSnapshot,
      );
      React.useSyncExternalStore(phone.subscribe, phone.snapshot);
      return {
        user: state.user,
        isAuthenticated:
          !state.loading &&
          !state.isResolvingSession &&
          state.hasAccessToken &&
          state.user?.id === phone.readySubject,
      };
    },
  };
});
vi.mock("convex/react", async () => {
  const React = await import("react");
  return {
    useQuery: (_reference, args) => {
      const phone = native.phone;
      React.useSyncExternalStore(phone.subscribe, phone.snapshot);
      return args === "skip" ? undefined : phone.bootstrap;
    },
    useMutation: (reference) =>
      React.useMemo(
        () => (args) => native.phone.mutation(reference, args),
        [reference],
      ),
  };
});

import schema from "../../backend/schema";
import { api } from "../../backend/_generated/api";
import { MobileSessionController } from "@/auth/session-controller";
import { LocalDatabaseProvider, useLocalData } from "@/data/local/provider";
import { SyncCoordinator } from "@/data/sync/sync-coordinator";
import {
  getLocalPreferences,
  getLocalWorkout,
  getLocalExerciseNotes,
} from "@/data/local/repository";

const modules = import.meta.glob([
  "../../backend/**/*.ts",
  "../../backend/_generated/*.js",
  "!../../backend/**/*.test.ts",
  "!../../backend/**/*.d.ts",
]);

function sqliteAdapter(sql) {
  const bindings = (args) =>
    args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  const db = {
    testSql: sql,
    closeAsync: async () => {}, // Connections are closed by PhoneScenario lifecycle.
    execAsync: async (query) => sql.exec(query),
    runAsync: async (query, ...args) =>
      sql.prepare(query).run(...bindings(args)),
    getFirstAsync: async (query, ...args) =>
      sql.prepare(query).get(...bindings(args)) ?? null,
    getAllAsync: async (query, ...args) =>
      sql.prepare(query).all(...bindings(args)),
    withTransactionAsync: (operation) => transaction(operation),
    withExclusiveTransactionAsync: (operation) =>
      transaction(() => operation(db)),
  };
  async function transaction(operation) {
    sql.exec("BEGIN");
    try {
      const result = await operation();
      sql.exec("COMMIT");
      return result;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function Probe() {
  const local = useLocalData();
  React.useEffect(() => {
    native.phone.local = local;
  }, [local]);
  return null;
}

export class PhoneScenario {
  online = false;
  subscriptionOrder = "before-ack";
  readySubject = null;
  bootstrap = undefined;
  revision = 0;
  listeners = new Set();
  keys = new Map();
  calls = [];
  errors = [];
  alerts = [];
  faults = [];
  bootstrapHolds = [];
  heldResponses = new Set();
  renderer = null;
  inflight = 0;
  serverWork = new Set();
  databases = new Map();
  cloud = convexTest(schema, modules);
  directory = mkdtempSync(join(tmpdir(), "workout-offline-account-"));
  file = join(this.directory, "workout-local-v1.db");
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.revision;

  constructor() {
    native.phone = this;
    native.appState = "active";
    native.listeners.clear();
    this.resetAuth();
  }

  notify() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }

  resetAuth() {
    this.auth = new MobileSessionController(
      {
        get: async (key) => this.keys.get(key) ?? null,
        set: async (key, value) => {
          this.keys.set(key, value);
        },
        remove: async (key) => {
          this.keys.delete(key);
        },
      },
      async (session) => {
        if (!this.online) throw new TypeError("Network request failed");
        return this.token(session.slice("test-session:".length));
      },
    );
  }

  token(subject) {
    return {
      session: `test-session:${subject}`,
      accessToken: `test-access:${subject}`,
      expiresAt: Date.now() + 3_600_000,
      user: { id: subject, email: `${subject}@example.invalid` },
    };
  }

  as(subject) {
    return this.cloud.withIdentity({
      subject,
      issuer: "https://auth.example.invalid",
    });
  }

  database(name) {
    if (name.includes("/") || name.includes("\\"))
      throw new Error("Invalid fixture database name");
    if (!this.databases.has(name)) {
      const sql = new DatabaseSync(join(this.directory, name));
      sql.exec("PRAGMA foreign_keys = ON");
      this.databases.set(name, { sql, db: sqliteAdapter(sql) });
    }
    return this.databases.get(name);
  }

  async open() {
    await this.auth.restore();
    await act(async () => {
      this.renderer = create(
        React.createElement(
          LocalDatabaseProvider,
          null,
          React.createElement(Probe),
          React.createElement(SyncCoordinator),
        ),
      );
    });
    return this;
  }

  async reopen() {
    await this.unmount();
    for (const { sql } of this.databases.values()) sql.close();
    this.databases.clear();
    this.bootstrap = undefined;
    this.readySubject = null;
    this.resetAuth();
    return this.open();
  }

  async unmount() {
    if (this.renderer) await act(async () => this.renderer.unmount());
    this.renderer = null;
    this.auth.pause();
  }

  async close() {
    for (const release of this.heldResponses) release();
    await this.tick();
    await this.unmount();
    for (const { sql } of this.databases.values()) sql.close();
    this.databases.clear();
    rmSync(this.directory, { recursive: true, force: true });
    native.phone = null;
    native.listeners.clear();
  }

  async edit(operation) {
    let result;
    await act(async () => {
      result = await operation(this.local);
    });
    return result;
  }

  async offline() {
    await act(async () => {
      this.online = false;
      this.notify();
    });
  }

  async continueOffline() {
    await act(async () => {
      await this.auth.continueOffline();
    });
  }

  async connect() {
    await act(async () => {
      this.online = true;
      if (this.auth.getSnapshot().user) {
        await this.auth.reconnect();
        await this.accountReady();
      }
      this.notify();
    });
  }

  async signIn(subject) {
    await act(async () => {
      await this.auth.signIn(async () => {
        if (!this.online) throw new TypeError("Network request failed");
        return this.token(subject);
      });
      await this.accountReady();
    });
  }

  async accountReady() {
    const subject = this.auth.getSnapshot().user.id;
    // The real account creation action verifies a synthetic WorkOS response.
    await this.as(subject).action(api.routes.auth.users.getOrCreate, {});
    this.readySubject = subject;
    this.notify();
    await this.pull();
  }

  async signOut() {
    await act(async () => {
      await this.auth.signOut();
      this.readySubject = null;
      this.bootstrap = undefined;
      this.notify();
    });
  }

  async pull() {
    if (!this.online) throw new TypeError("Network request failed");
    const subject = this.auth.getSnapshot().user?.id;
    if (!subject) return;
    const payload = await this.as(subject).query(
      api.routes.ios.bootstrap.get,
      {},
    );
    const deliver = () => {
      this.bootstrap = payload;
      this.notify();
    };
    const held = this.bootstrapHolds.shift();
    if (held) {
      // Query delivery does not gate verified account readiness. This also
      // permits deliberately stale delivery after an account switch.
      held.requested.resolve({ subject, payload });
      void held.release.promise.then(deliver);
    } else deliver();
  }

  holdNextBootstrap() {
    const requested = deferred();
    const release = deferred();
    this.heldResponses.add(release.resolve);
    this.bootstrapHolds.push({ requested, release });
    return {
      requested: requested.promise,
      release: () => {
        this.heldResponses.delete(release.resolve);
        release.resolve();
      },
    };
  }

  async mutation(reference, args) {
    const name = getFunctionName(reference).split(":").at(-1);
    const subject = this.auth.getSnapshot().user?.id;
    const call = {
      name,
      subject,
      operationId: args.operationId,
      committed: false,
      delivered: false,
      subscriptionDeliveredBeforeAck: false,
    };
    this.calls.push(call);
    if (!this.online) throw new TypeError("Network request failed");
    this.inflight++;
    try {
      const index = this.faults.findIndex((fault) => fault.name === name);
      const fault = index < 0 ? null : this.faults.splice(index, 1)[0];
      if (fault?.beforeCommit) await fault.beforeCommit(call);
      const dispatchedSubject = fault?.routeToCurrentIdentity
        ? this.auth.getSnapshot().user?.id
        : subject;
      call.dispatchedSubject = dispatchedSubject;
      const work = this.as(dispatchedSubject).mutation(reference, args);
      this.serverWork.add(work);
      let result;
      try {
        result = await work;
      } finally {
        this.serverWork.delete(work);
      }
      call.committed = true;
      if (fault?.afterCommit) await fault.afterCommit(call, result);
      if (fault?.loseResponse)
        throw new TypeError("Response lost after server commit");
      // A successful response is independent of subscription delivery. A reply
      // already in transit can arrive after the phone disconnects or signs out.
      if (
        this.subscriptionOrder === "before-ack" &&
        this.online &&
        this.auth.getSnapshot().user?.id === subject
      ) {
        await this.pull();
        call.subscriptionDeliveredBeforeAck = true;
      }
      call.delivered = true;
      return result;
    } finally {
      this.inflight--;
    }
  }

  holdNext(name) {
    const committed = deferred();
    const release = deferred();
    this.heldResponses.add(release.resolve);
    this.faults.push({
      name,
      afterCommit: async (call) => {
        committed.resolve(call);
        await release.promise;
      },
    });
    return {
      committed: committed.promise,
      release: () => {
        this.heldResponses.delete(release.resolve);
        release.resolve();
      },
    };
  }

  holdNextRequest(name) {
    const started = deferred();
    const release = deferred();
    this.heldResponses.add(release.resolve);
    this.faults.push({
      name,
      routeToCurrentIdentity: true,
      beforeCommit: async (call) => {
        started.resolve(call);
        await release.promise;
      },
    });
    return {
      started: started.promise,
      release: () => {
        this.heldResponses.delete(release.resolve);
        release.resolve();
      },
    };
  }

  outbox() {
    return this.sql
      .prepare(
        "SELECT entity_type, entity_id, operation_id, payload_json FROM local_sync_outbox ORDER BY entity_type, entity_id",
      )
      .all();
  }

  async tick(ms = 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
      await Promise.allSettled([...this.serverWork]);
      // Module loading and Node I/O are real even while the retry clock is fake.
      await nextTurn();
    });
  }

  async settle() {
    for (let pass = 0; pass < 180; pass++) {
      await this.tick(1_000);
      if (!this.inflight && this.outbox().length === 0) {
        await act(async () => {
          await this.pull();
        });
        await this.tick();
        return;
      }
    }
    throw new Error(
      `Sync did not converge within three simulated minutes: ${JSON.stringify({ pending: this.outbox().map(({ entity_type, operation_id }) => ({ entity_type, operation_id })), calls: this.calls.slice(-5), errors: this.errors.slice(-5) })}`,
    );
  }

  async window(ms) {
    // Let real handler/module I/O finish between clock steps so a failed reply
    // starts its retry delay when it arrives, rather than at the window's end.
    for (let elapsed = 0; elapsed < ms; elapsed += 1_000) {
      await this.tick(Math.min(1_000, ms - elapsed));
    }
  }

  async records(subject) {
    const user = await this.as(subject).query(
      api.routes.auth.users.current,
      {},
    );
    return this.cloud.run(async (ctx) => {
      const result = { user };
      for (const table of [
        "workoutTemplates",
        "workoutSessions",
        "exerciseNotes",
        "customExercises",
        "places",
        "machines",
        "iosSyncReceipts",
      ]) {
        result[table] = (await ctx.db.query(table).collect()).filter(
          (row) => row.userId === user._id,
        );
      }
      const templateIds = new Set(
        result.workoutTemplates.map((row) => row._id),
      );
      const sessionIds = new Set(result.workoutSessions.map((row) => row._id));
      result.templateExercises = (
        await ctx.db.query("templateExercises").collect()
      ).filter((row) => templateIds.has(row.templateId));
      result.sessionExercises = (
        await ctx.db.query("sessionExercises").collect()
      ).filter((row) => sessionIds.has(row.sessionId));
      const exerciseIds = new Set(
        result.sessionExercises.map((row) => row._id),
      );
      result.sets = (await ctx.db.query("sets").collect()).filter((row) =>
        exerciseIds.has(row.sessionExerciseId),
      );
      return result;
    });
  }

  async assertLocalData(sessionId, expected) {
    expect(await getLocalWorkout(this.db, sessionId)).toMatchObject(expected);
  }
  preferences() {
    return getLocalPreferences(this.db);
  }
  notes(slugs) {
    return getLocalExerciseNotes(this.db, slugs);
  }
  workout(id) {
    return getLocalWorkout(this.db, id);
  }

  async appState(state) {
    await act(async () => {
      native.appState = state;
      for (const listener of native.listeners) listener(state);
    });
  }
}

export function installTestEnvironment() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
  // Reproducible retry jitter; UUIDs remain real and unique.
  let noise = 2026;
  vi.spyOn(Math, "random").mockImplementation(() => {
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
    return noise / 0x1_0000_0000;
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv("WORKOS_API_KEY", "synthetic-test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (
        parsed.origin !== "https://api.workos.com" ||
        !parsed.pathname.startsWith("/user_management/users/user_test_")
      )
        throw new Error(
          `Unexpected external request in offline account test: ${url}`,
        );
      const id = decodeURIComponent(parsed.pathname.split("/").at(-1));
      return Response.json({
        id,
        email: `${id}@example.invalid`,
        email_verified: true,
      });
    }),
  );
  vi.spyOn(console, "warn").mockImplementation((...args) =>
    native.phone?.errors.push(args.map(String).join(" ")),
  );
  const error = console.error;
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (String(args[0]).startsWith("react-test-renderer is deprecated")) return;
    error(...args);
  });
}

export function restoreTestEnvironment() {
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
}
