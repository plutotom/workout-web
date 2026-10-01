import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileAccountProvider } from "./account-provider";
import { AUTH_STATE_KEY } from "./keychain";
import {
  AuthProvider,
  useAuthCredentials,
  useMobileAuth,
} from "./auth-provider";

const lockedError = () =>
  new Error(
    "Calling the 'getValueWithKeyAsync' function has failed → Caused by: User interaction is not allowed.",
  );

const appState = vi.hoisted(() => {
  let current = "active";
  const listeners = new Set<(state: string) => void>();
  return {
    get currentState() {
      return current;
    },
    set currentState(value: string) {
      current = value;
    },
    addEventListener(_event: string, listener: (state: string) => void) {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    },
    emit(state: string) {
      current = state;
      for (const listener of listeners) listener(state);
    },
    reset() {
      current = "active";
      listeners.clear();
    },
  };
});

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  locked: false,
  beforeWrite: null as null | ((key: string) => Promise<void>),
  beforeRead: null as null | (() => Promise<void>),
  openAuthSession: vi.fn(),
  deleted: [] as string[],
  fetch: vi.fn(),
  auth: { isAuthenticated: false, isLoading: false, isRefreshing: false },
  account: null as { workosId: string } | null,
  bootstrap: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (key: string) => {
    if (mocks.beforeRead) await mocks.beforeRead();
    if (mocks.locked) throw lockedError();
    return mocks.storage.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    if (mocks.beforeWrite) await mocks.beforeWrite(key);
    if (mocks.locked) throw lockedError();
    mocks.storage.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (mocks.locked) throw lockedError();
    mocks.deleted.push(key);
    mocks.storage.delete(key);
  },
}));
vi.mock("react-native", () => ({
  AppState: appState,
}));
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: mocks.openAuthSession,
}));
vi.mock("@backend/api", () => ({
  api: {
    routes: {
      auth: { users: { current: "current", getOrCreate: "bootstrap" } },
    },
  },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => mocks.auth,
  useQuery: (_query: unknown, args: unknown) =>
    args === "skip" ? undefined : mocks.account,
  useAction: () => mocks.bootstrap,
}));

const user = { id: "user_1", email: "athlete@example.com" };
const tokenResponse = {
  session: "rotated-session",
  accessToken: "token",
  user,
};

let renderer: ReactTestRenderer;
let auth: ReturnType<typeof useMobileAuth>;
let credentials: ReturnType<typeof useAuthCredentials>;

function Probe() {
  const mobileAuth = useMobileAuth();
  const authCredentials = useAuthCredentials();
  useEffect(() => {
    auth = mobileAuth;
    credentials = authCredentials;
  });
  return null;
}

function persisted() {
  const value = mocks.storage.get(AUTH_STATE_KEY);
  return value
    ? (JSON.parse(value) as {
        session: string | null;
        userJson: string | null;
        localMode: boolean;
      })
    : null;
}

function tree() {
  return (
    <AuthProvider>
      <MobileAccountProvider>
        <Probe />
      </MobileAccountProvider>
    </AuthProvider>
  );
}

async function mount() {
  await act(async () => {
    renderer = create(tree());
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv("EXPO_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
  vi.stubEnv("EXPO_PUBLIC_WEB_URL", "https://workout.example.com");
  vi.stubGlobal("fetch", mocks.fetch);
  appState.reset();
  mocks.storage.clear();
  mocks.deleted = [];
  mocks.locked = false;
  mocks.beforeWrite = null;
  mocks.beforeRead = null;
  mocks.openAuthSession.mockReset().mockResolvedValue({
    type: "success",
    url: "workout://auth/callback?code=exchange-code",
  });
  mocks.storage.set("workout.workos.session.v1", "stored-session");
  mocks.storage.set("workout.workos.user.v1", JSON.stringify(user));
  mocks.storage.set("workout.local-mode.v1", "1");
  mocks.auth = {
    isAuthenticated: false,
    isLoading: false,
    isRefreshing: false,
  };
  mocks.account = null;
  mocks.fetch
    .mockReset()
    .mockResolvedValue({ ok: true, json: async () => tokenResponse });
  mocks.bootstrap.mockReset().mockResolvedValue("account_1");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("locked-device auth guards", () => {
  it("does not clear Keychain or send the athlete to a signed-out state", async () => {
    mocks.locked = true;
    await mount();
    expect(auth.loading).toBe(true);
    expect(auth.canUseApp).toBe(false);
    expect(mocks.deleted).toEqual([]);
    expect(mocks.storage.get("workout.workos.session.v1")).toBe(
      "stored-session",
    );
  });

  it("retries hydrate when the app becomes active after a locked Keychain miss", async () => {
    mocks.locked = true;
    await mount();
    expect(auth.loading).toBe(true);

    mocks.locked = false;
    await act(async () => {
      appState.emit("active");
    });
    expect(auth.loading).toBe(false);
    expect(auth.canUseApp).toBe(true);
    expect(auth.user?.id).toBe(user.id);
    expect(credentials.isAuthenticated).toBe(true);
  });

  it("skips a force-refresh while locked so the cached token is not rotated", async () => {
    await mount();
    expect(credentials.isAuthenticated).toBe(true);
    mocks.fetch.mockClear();
    mocks.locked = true;
    appState.currentState = "background";

    let token: string | null = null;
    await act(async () => {
      token = await credentials.fetchAccessToken({ forceRefreshToken: true });
    });
    expect(token).toBe("token");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(persisted()?.session).toBe("rotated-session");
  });

  it("does not wipe the session when token refresh returns 503", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Authentication unavailable" }),
    });
    await mount();
    expect(auth.canUseApp).toBe(true);
    expect(auth.user?.id).toBe(user.id);
    expect(credentials.isAuthenticated).toBe(false);
    expect(persisted()?.session).toBe("stored-session");
    expect(persisted()?.userJson).toBe(JSON.stringify(user));
    expect(persisted()?.localMode).toBe(true);
  });

  it("still signs out on a confirmed 401 after an unlocked persist", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Session expired" }),
    });
    await mount();
    expect(auth.user).toBeNull();
    expect(auth.canUseApp).toBe(false);
    expect(persisted()?.session).toBeNull();
  });

  it("shares a single in-flight refresh between hydrate and fetchAccessToken", async () => {
    let resolveRefresh!: (value: unknown) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    await mount();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const inFlight = credentials.fetchAccessToken({ forceRefreshToken: true });
    await act(async () =>
      resolveRefresh({ ok: true, json: async () => tokenResponse }),
    );
    await act(async () => {
      await inFlight;
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(credentials.isAuthenticated).toBe(true);
  });

  it("keeps the rotated token in memory and rewrites Keychain once unlocked", async () => {
    await mount();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        session: "second-rotation",
        accessToken: "token-2",
        user,
      }),
    });
    mocks.locked = true;

    let token: string | null = null;
    await act(async () => {
      token = await credentials.fetchAccessToken({ forceRefreshToken: true });
    });
    expect(token).toBe("token-2");
    expect(persisted()?.session).toBe("rotated-session");

    mocks.locked = false;
    await act(async () => {
      appState.emit("active");
    });
    expect(persisted()?.session).toBe("second-rotation");
    expect(auth.canUseApp).toBe(true);
  });
});

describe("auth persistence regressions", () => {
  it("keeps explicit sign-out final when refresh persistence is in flight", async () => {
    await mount();
    let releaseWrite!: () => void;
    let signalWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      signalWrite = resolve;
    });
    const writeBlocked = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    mocks.beforeWrite = async (key) => {
      if (key !== AUTH_STATE_KEY) return;
      signalWrite();
      await writeBlocked;
    };
    let refresh!: Promise<string | null>;
    await act(async () => {
      refresh = credentials.fetchAccessToken({ forceRefreshToken: true });
      await writeStarted;
    });
    let signingOut!: Promise<void>;
    await act(async () => {
      signingOut = auth.signOut();
    });
    expect(auth.user).toBeNull();
    await act(async () => {
      releaseWrite();
      await Promise.all([refresh, signingOut]);
    });
    expect(auth.user).toBeNull();
    expect(credentials.isAuthenticated).toBe(false);
    expect(persisted()?.session).toBeNull();
  });

  it("retains the durable session when migrate-on-read cannot rewrite it", async () => {
    mocks.beforeWrite = async (key) => {
      if (key === AUTH_STATE_KEY) throw new Error("Keychain write failed");
    };
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Authentication unavailable" }),
    });
    await mount();
    expect(auth.user?.id).toBe(user.id);
    expect(mocks.storage.get("workout.workos.session.v1")).toBe(
      "stored-session",
    );
    expect(mocks.deleted).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.beforeWrite = null;
    await act(async () => {
      appState.emit("active");
    });
    expect(persisted()?.session).toBe("stored-session");
  });
  it("ignores a late refresh 401 after a new sign-in, even with the same sealed session", async () => {
    await mount();
    let finishRefresh!: (value: unknown) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const refresh = credentials.fetchAccessToken({ forceRefreshToken: true });
    await act(async () => {
      await auth.signOut();
      await auth.signIn();
    });
    expect(auth.user?.id).toBe(user.id);
    await act(async () => {
      finishRefresh({
        ok: false,
        status: 401,
        json: async () => ({ error: "Session expired" }),
      });
      await refresh;
    });
    expect(auth.user?.id).toBe(user.id);
    expect(persisted()?.session).toBe("rotated-session");
  });

  it("does not let delayed startup hydration restore a signed-out user", async () => {
    let releaseRead!: () => void;
    const readBlocked = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    mocks.beforeRead = () => readBlocked;
    await mount();
    let signingOut!: Promise<void>;
    await act(async () => {
      signingOut = auth.signOut();
    });
    expect(auth.user).toBeNull();
    await act(async () => {
      releaseRead();
      await signingOut;
    });
    expect(auth.canUseApp).toBe(false);
    expect(persisted()?.session).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps a new sign-in when an earlier locked sign-out was queued", async () => {
    await mount();
    mocks.locked = true;
    await act(async () => {
      await auth.signOut();
    });
    expect(auth.user).toBeNull();
    mocks.locked = false;
    await act(async () => {
      await auth.signIn();
      appState.emit("active");
    });
    expect(auth.user?.id).toBe(user.id);
    expect(persisted()?.session).toBe("rotated-session");
    expect(credentials.isAuthenticated).toBe(true);
  });

  it("queues rotated tokens after a non-lock storage failure and prevents another rotation", async () => {
    await mount();
    mocks.beforeWrite = async () => {
      throw new Error("Keychain write failed");
    };
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...tokenResponse,
        session: "second-rotation",
        accessToken: "token-2",
      }),
    });
    await act(async () => {
      await credentials.fetchAccessToken({ forceRefreshToken: true });
    });
    expect(persisted()?.session).toBe("rotated-session");
    mocks.fetch.mockClear();
    await act(async () => {
      await credentials.fetchAccessToken({ forceRefreshToken: true });
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.beforeWrite = null;
    await act(async () => {
      appState.emit("active");
    });
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).session).toBe(
      "second-rotation",
    );
    expect(persisted()?.session).toBe("second-rotation");
  });

  it("refreshes a token deferred in the background when the app becomes active", async () => {
    await mount();
    mocks.fetch.mockClear();
    appState.currentState = "background";
    await act(async () => {
      await credentials.fetchAccessToken({ forceRefreshToken: true });
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    await act(async () => {
      appState.emit("active");
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).forceRefresh).toBe(
      true,
    );
    expect(auth.loading).toBe(false);
    expect(auth.canUseApp).toBe(true);
  });

  it("restores the migrated account offline on a cold launch", async () => {
    await mount();
    await act(async () => {
      renderer.unmount();
    });
    mocks.fetch.mockRejectedValue(new Error("Airplane mode"));
    await mount();
    expect(auth.user?.id).toBe(user.id);
    expect(auth.canUseApp).toBe(true);
    expect(credentials.isAuthenticated).toBe(false);
    expect(persisted()?.session).toBe("rotated-session");
  });
});
