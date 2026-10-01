import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileAccountProvider } from "./account-provider";
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
    if (mocks.locked) throw lockedError();
    return mocks.storage.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
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
  openAuthSessionAsync: vi.fn(),
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
    expect(mocks.storage.get("workout.workos.session.v1")).toBe(
      "rotated-session",
    );
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
    expect(mocks.storage.get("workout.workos.session.v1")).toBe(
      "stored-session",
    );
    expect(mocks.storage.get("workout.workos.user.v1")).toBe(
      JSON.stringify(user),
    );
    expect(mocks.storage.get("workout.local-mode.v1")).toBe("1");
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
    expect(mocks.storage.get("workout.workos.session.v1")).toBeUndefined();
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
    expect(mocks.storage.get("workout.workos.session.v1")).toBe(
      "rotated-session",
    );

    mocks.locked = false;
    await act(async () => {
      appState.emit("active");
    });
    expect(mocks.storage.get("workout.workos.session.v1")).toBe(
      "second-rotation",
    );
    expect(auth.canUseApp).toBe(true);
  });
});
