import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { createElement, useEffect } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProviderWithAuth } from "convex/react";
import {
  AuthProvider,
  useAuthCredentials,
  useMobileAuth,
} from "@/auth/auth-provider";
import { MobileAccountProvider } from "@/auth/account-provider";
import { AUTH_STATE_KEY } from "@/auth/keychain";
import { LocalDatabaseProvider, useLocalData } from "@/data/local/provider";
import { accountDatabaseName } from "@/data/local/storage-scopes";
import { getLocalWorkout } from "@/data/local/repository";

const native = vi.hoisted(() => ({
  storage: new Map(),
  databases: new Map(),
  open: undefined,
  connected: false,
  bootstrap: vi.fn(),
  browser: vi.fn(),
  fetch: vi.fn(),
  holdNextRead: null,
}));
vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
  getItemAsync: async (key) => native.storage.get(key) ?? null,
  setItemAsync: async (key, value) => native.storage.set(key, value),
  deleteItemAsync: async (key) => native.storage.delete(key),
}));
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession() {},
  openAuthSessionAsync: native.browser,
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => randomUUID(),
  digestStringAsync: async () => "a".repeat(64),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove() {} }),
  },
}));
vi.mock("@/health/watch-bridge", () => ({
  endWatchWorkout: async () => null,
  discardWatchWorkout: async () => null,
}));
vi.mock("expo-sqlite", async () => {
  const React = await import("react");
  const context = React.createContext(null);
  return {
    openDatabaseAsync: async (name) => native.open(name).db,
    backupDatabaseAsync: async ({ sourceDatabase, destDatabase }) =>
      backup(
        sourceDatabase.sql,
        destDatabase.sql.prepare("PRAGMA database_list").get().file,
      ),
    useSQLiteContext: () => React.useContext(context),
    SQLiteProvider: ({ databaseName, onInit, children }) => {
      const record = React.useMemo(
        () => native.open(databaseName),
        [databaseName],
      );
      const [initialized, setInitialized] = React.useState(null);
      React.useEffect(() => {
        let active = true;
        void onInit(record.db).then(() => {
          if (active) setInitialized(record);
        });
        return () => {
          active = false;
          // Expo's real provider releases its native lease on unmount.
          void record.db.closeAsync();
        };
      }, [record, onInit]);
      return initialized === record
        ? React.createElement(context.Provider, { value: record.db }, children)
        : null;
    },
  };
});
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal()),
  // Keep Convex's actual provider, effects and useConvexAuth. Only server I/O is simulated.
  useAction: () => native.bootstrap,
  useQuery: (_query, args) =>
    args === "skip" ? undefined : { workosId: "user_test_reconnect" },
}));

const user = { id: "user_test_reconnect", email: "reconnect@example.invalid" };
let directory, renderer, auth, credentials, local, client, sequence;
function Probe() {
  const account = useMobileAuth(),
    raw = useAuthCredentials(),
    data = useLocalData();
  useEffect(() => {
    auth = account;
    credentials = raw;
    local = data;
  });
  return null;
}
function open(name) {
  if (native.databases.has(name)) {
    const record = native.databases.get(name);
    record.references++;
    return record;
  }
  const sql = new DatabaseSync(join(directory, name));
  const binds = (values) =>
    values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
  let pending = Promise.resolve();
  function transaction(operation) {
    const result = pending
      .catch(() => {})
      .then(async () => {
        sql.exec("BEGIN");
        try {
          const value = await operation();
          sql.exec("COMMIT");
          return value;
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        }
      });
    pending = result;
    return result;
  }
  const db = {
    sql,
    databasePath: join(directory, name),
    closeAsync: async () => {
      record.references--;
      if (record.references === 0 && record.busyReads > 0)
        record.closedWhileBusy = true;
    },
    execAsync: async (query) => sql.exec(query),
    runAsync: async (query, ...values) =>
      sql.prepare(query).run(...binds(values)),
    getFirstAsync: async (query, ...values) => {
      if (native.holdNextRead && query.includes("local_sessions")) {
        const wait = native.holdNextRead;
        native.holdNextRead = null;
        record.busyReads++;
        try {
          await wait;
        } finally {
          record.busyReads--;
        }
      }
      return sql.prepare(query).get(...binds(values)) ?? null;
    },
    getAllAsync: async (query, ...values) =>
      sql.prepare(query).all(...binds(values)),
    withTransactionAsync: transaction,
    withExclusiveTransactionAsync: (operation) =>
      transaction(() => operation(db)),
  };
  const record = {
    sql,
    db,
    settle: () => pending,
    references: 1,
    busyReads: 0,
    closedWhileBusy: false,
  };
  native.databases.set(name, record);
  return record;
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
}
async function mount() {
  await act(async () => {
    renderer = create(
      createElement(
        AuthProvider,
        null,
        createElement(
          ConvexProviderWithAuth,
          { client, useAuth: useAuthCredentials },
          createElement(
            MobileAccountProvider,
            null,
            createElement(LocalDatabaseProvider, null, createElement(Probe)),
          ),
        ),
      ),
    );
  });
  await settle();
}
async function seed() {
  let id;
  await act(async () => {
    id = await local.startBlank();
    await local.addExercise(id, "bench", [{ weight: 135, reps: 5 }]);
    await local.saveNote("bench", "synthetic saved cue");
  });
  return id;
}
function rows() {
  const { sql } = native.databases.get(accountDatabaseName(user.id));
  return Object.fromEntries(
    [
      "local_sessions",
      "local_session_exercises",
      "local_sets",
      "local_exercise_notes",
      "local_sync_outbox",
    ].map((table) => [
      table,
      sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
}
function response() {
  return {
    ok: true,
    json: async () => ({
      session: `synthetic-session-${++sequence}`,
      accessToken: `synthetic-token-${sequence}`,
      user,
      expiresAt: Date.now() + 300_000,
    }),
  };
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  directory = mkdtempSync(join(tmpdir(), "auth-convex-reconnect-"));
  native.databases.clear();
  native.open = open;
  native.storage.clear();
  native.storage.set(
    AUTH_STATE_KEY,
    JSON.stringify({
      session: "synthetic-session-initial",
      userJson: JSON.stringify(user),
      localMode: true,
    }),
  );
  native.connected = false;
  native.holdNextRead = null;
  sequence = 0;
  auth = credentials = local = undefined;
  native.bootstrap.mockReset().mockResolvedValue("account_test");
  native.browser.mockReset();
  native.fetch.mockReset().mockImplementation(async () => response());
  vi.stubEnv("EXPO_PUBLIC_CONVEX_URL", "https://synthetic.convex.cloud");
  vi.stubEnv("EXPO_PUBLIC_WEB_URL", "https://synthetic.example.invalid");
  vi.stubGlobal("fetch", native.fetch);
  client = {
    setAuth: vi.fn((fetchToken, onChange) => {
      void fetchToken({ forceRefreshToken: false }).then((token) =>
        onChange(Boolean(token) && native.connected),
      );
    }),
    clearAuth: vi.fn(),
  };
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  for (const record of native.databases.values()) {
    await record.settle().catch(() => {});
    record.sql.close();
  }
  native.databases.clear();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("real Convex auth Retry with account-scoped SQLite", () => {
  it("keeps an account handle alive through sign-out/re-login with an in-flight workout read", async () => {
    await mount();
    const id = await seed(),
      before = rows();
    const record = native.databases.get(accountDatabaseName(user.id));
    let releaseRead;
    native.holdNextRead = new Promise((resolve) => {
      releaseRead = resolve;
    });
    const pendingRead = getLocalWorkout(record.db, id);
    expect(record.busyReads).toBe(1);
    try {
      await act(async () => {
        await auth.signOut();
      });
      await settle();
      expect(local.owner).toBeNull();
      expect(record.closedWhileBusy).toBe(false);
      expect(record.references).toBeGreaterThan(0);
      native.connected = true;
      for (let attempt = 0; attempt < 3; attempt++) {
        native.browser.mockResolvedValueOnce({
          type: "success",
          url: "workout://auth/callback?code=synthetic-exchange",
        });
        await act(async () => {
          await auth.signIn();
        });
        await settle();
        expect(auth.accountStatus).toBe("ready");
        expect(local.owner).toBe(user.id);
        expect(record.references).toBe(2); // One provider + one process-lifetime lease.
        expect(rows()).toEqual(before);
        if (attempt < 2)
          await act(async () => {
            await auth.signOut();
          });
      }
      expect(record.closedWhileBusy).toBe(false);
    } finally {
      releaseRead();
      expect((await pendingRead)._id).toBe(id);
    }
  });
  it("retains account data after a failed Retry and reconnects on a later Retry", async () => {
    await mount();
    await seed();
    const before = rows();
    native.fetch.mockRejectedValueOnce(
      new Error("synthetic network unavailable"),
    );
    await act(async () => {
      await auth.retryAccountConnection();
    });
    expect(auth.accountStatus).toBe("error");
    expect(auth.user?.id).toBe(user.id);
    expect(auth.canUseApp).toBe(true);
    expect(local.owner).toBe(user.id);
    expect(rows()).toEqual(before);
    expect(native.bootstrap).not.toHaveBeenCalled();
    expect(JSON.parse(native.storage.get(AUTH_STATE_KEY)).session).toBeTruthy();
    native.connected = true;
    await act(async () => {
      await auth.retryAccountConnection();
    });
    expect(auth.accountStatus).toBe("ready");
    expect(rows()).toEqual(before);
    expect(native.browser).not.toHaveBeenCalled();
  });
  it("does not restore a signed-out identity when an earlier Retry finishes late", async () => {
    await mount();
    await seed();
    const before = rows();
    let completeRefresh;
    native.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeRefresh = resolve;
        }),
    );
    let retry;
    await act(async () => {
      retry = auth.retryAccountConnection();
    });
    expect(completeRefresh).toBeTypeOf("function");
    await act(async () => {
      await auth.signOut();
    });
    native.connected = true;
    await act(async () => {
      completeRefresh(response());
      await retry;
    });
    await settle();
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.accountStatus).toBe("offline");
    expect(local.owner).toBeNull();
    expect(native.bootstrap).not.toHaveBeenCalled();
    expect(rows()).toEqual(before);
    expect(JSON.parse(native.storage.get(AUTH_STATE_KEY))).toEqual({
      session: null,
      userJson: null,
      localMode: false,
    });
  });
  it("restarts rejected cloud authentication and preserves offline workouts, identities, notes and queued writes", async () => {
    await mount();
    expect(auth.accountStatus).toBe("error");
    await seed();
    const before = rows(),
      fetcher = credentials.fetchAccessToken;
    const attempts = client.setAuth.mock.calls.length;
    native.connected = true;
    await act(async () => {
      await auth.retryAccountConnection();
    });
    expect(auth.accountStatus).toBe("ready");
    expect(credentials.fetchAccessToken).not.toBe(fetcher);
    expect(client.setAuth.mock.calls.length).toBeGreaterThan(attempts);
    expect(native.bootstrap).toHaveBeenCalledOnce();
    expect(local.owner).toBe(user.id);
    expect(rows()).toEqual(before);
    expect(native.browser).not.toHaveBeenCalled();
    expect(JSON.parse(native.storage.get(AUTH_STATE_KEY)).userJson).toBe(
      JSON.stringify(user),
    );
    // Ordinary token refreshes must not restart the cloud handshake on every render.
    const connectedAttempts = client.setAuth.mock.calls.length;
    await act(async () => {
      await credentials.fetchAccessToken({ forceRefreshToken: true });
    });
    expect(client.setAuth).toHaveBeenCalledTimes(connectedAttempts);
    await act(async () => renderer.unmount());
    renderer = undefined;
    await mount();
    expect(auth.accountStatus).toBe("ready");
    expect(local.owner).toBe(user.id);
    expect(rows()).toEqual(before);
  });
});
