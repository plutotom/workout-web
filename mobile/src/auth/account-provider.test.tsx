import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileAccountProvider } from "./account-provider";
import {
  AuthProvider,
  useAuthCredentials,
  useMobileAuth,
} from "./auth-provider";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  auth: { isAuthenticated: false, isLoading: false, isRefreshing: false },
  account: null as
    | { workosId: string; email?: string; emailVerifiedAt?: number }
    | null
    | undefined,
  bootstrap: vi.fn(),
  openAuthSession: vi.fn(),
  fetch: vi.fn(),
  cloudWrite: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (key: string) => mocks.storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) =>
    mocks.storage.set(key, value),
  deleteItemAsync: async (key: string) => mocks.storage.delete(key),
}));
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: () => {} }),
  },
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
  useEffect(() => {
    if (mobileAuth.isAuthenticated) mocks.cloudWrite();
  }, [mobileAuth.isAuthenticated]);
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
async function update() {
  await act(async () => {
    renderer.update(tree());
  });
}

function deferredBootstrap() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv("EXPO_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
  vi.stubEnv("EXPO_PUBLIC_WEB_URL", "https://workout.example.com");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.storage.clear();
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
  mocks.openAuthSession.mockReset().mockResolvedValue({
    type: "success",
    url: "workout://auth/callback?code=exchange-code",
  });
  mocks.cloudWrite.mockReset();
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

describe("mobile account connection", () => {
  it("settles into offline mode only after confirming there is no saved session", async () => {
    mocks.storage.clear();
    mocks.storage.set("workout.local-mode.v1", "1");
    await mount();
    expect(auth.accountStatus).toBe("offline");
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.canUseApp).toBe(true);
    expect(credentials.isResolvingSession).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("bootstraps an existing unverified account before enabling cloud writes, once per connection", async () => {
    const bootstrap = deferredBootstrap();
    mocks.auth.isAuthenticated = true;
    mocks.account = { workosId: user.id, email: "old@example.com" };
    mocks.bootstrap.mockReturnValueOnce(bootstrap.promise);
    await mount();
    expect(mocks.bootstrap).toHaveBeenCalledExactlyOnceWith({});
    expect(auth.accountStatus).toBe("connecting");
    expect(mocks.cloudWrite).not.toHaveBeenCalled();

    await update();
    expect(mocks.bootstrap).toHaveBeenCalledOnce();
    await act(async () => bootstrap.resolve("account_1"));
    expect(auth.isAuthenticated).toBe(true);
    expect(mocks.cloudWrite).toHaveBeenCalledOnce();

    mocks.account = {
      workosId: user.id,
      email: user.email,
      emailVerifiedAt: Date.now(),
    };
    await update();
    await act(async () => {
      await credentials.fetchAccessToken({ forceRefreshToken: true });
    });
    expect(mocks.bootstrap).toHaveBeenCalledOnce();
    expect(auth.isAuthenticated).toBe(true);
  });

  it("keeps an existing account offline after failed verification until an explicit retry succeeds", async () => {
    const retryBootstrap = deferredBootstrap();
    mocks.auth.isAuthenticated = true;
    mocks.account = { workosId: user.id };
    mocks.bootstrap
      .mockRejectedValueOnce(new Error("verification unavailable"))
      .mockReturnValueOnce(retryBootstrap.promise);
    await mount();
    expect(auth.accountStatus).toBe("error");
    expect(auth.canUseApp).toBe(true);
    expect(mocks.cloudWrite).not.toHaveBeenCalled();

    await act(async () => {
      await auth.retryAccountConnection();
    });
    expect(mocks.bootstrap).toHaveBeenCalledTimes(2);
    expect(auth.accountStatus).toBe("connecting");
    expect(mocks.cloudWrite).not.toHaveBeenCalled();
    await act(async () => retryBootstrap.resolve("account_1"));
    expect(auth.accountStatus).toBe("ready");
    expect(mocks.cloudWrite).toHaveBeenCalledOnce();
  });

  it("ignores bootstrap completion from an interrupted authentication attempt", async () => {
    const previousBootstrap = deferredBootstrap();
    const nextBootstrap = deferredBootstrap();
    mocks.auth.isAuthenticated = true;
    mocks.account = { workosId: user.id };
    mocks.bootstrap
      .mockReturnValueOnce(previousBootstrap.promise)
      .mockReturnValueOnce(nextBootstrap.promise);
    await mount();
    mocks.auth.isRefreshing = true;
    await update();
    mocks.auth.isRefreshing = false;
    await update();
    expect(mocks.bootstrap).toHaveBeenCalledTimes(2);

    await act(async () => previousBootstrap.resolve("account_1"));
    expect(auth.isAuthenticated).toBe(false);
    expect(mocks.cloudWrite).not.toHaveBeenCalled();
    await act(async () => nextBootstrap.resolve("account_1"));
    expect(auth.isAuthenticated).toBe(true);
  });

  it("requires a fresh bootstrap after signing out and back into the same account", async () => {
    const nextBootstrap = deferredBootstrap();
    mocks.auth.isAuthenticated = true;
    mocks.account = { workosId: user.id };
    await mount();
    expect(auth.isAuthenticated).toBe(true);
    await act(async () => {
      await auth.signOut();
    });
    expect(auth.isAuthenticated).toBe(false);

    mocks.bootstrap.mockReturnValueOnce(nextBootstrap.promise);
    await act(async () => {
      await auth.signIn();
    });
    expect(mocks.bootstrap).toHaveBeenCalledTimes(2);
    expect(auth.isAuthenticated).toBe(false);
    await act(async () => nextBootstrap.resolve("account_1"));
    expect(auth.isAuthenticated).toBe(true);
  });

  it("ignores an old user's bootstrap when switching accounts", async () => {
    const previousBootstrap = deferredBootstrap();
    const nextBootstrap = deferredBootstrap();
    const nextUser = { id: "user_2", email: "other@example.com" };
    mocks.auth.isAuthenticated = true;
    mocks.account = { workosId: user.id };
    mocks.bootstrap
      .mockReturnValueOnce(previousBootstrap.promise)
      .mockReturnValueOnce(nextBootstrap.promise);
    await mount();
    await act(async () => {
      await auth.signOut();
    });
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...tokenResponse, user: nextUser }),
    });
    await act(async () => {
      await auth.signIn();
    });
    expect(auth.user?.id).toBe(nextUser.id);
    expect(mocks.bootstrap).toHaveBeenCalledTimes(2);
    expect(auth.isAuthenticated).toBe(false);

    mocks.account = { workosId: nextUser.id };
    await update();
    await act(async () => previousBootstrap.resolve("account_1"));
    expect(auth.isAuthenticated).toBe(false);
    expect(mocks.cloudWrite).not.toHaveBeenCalled();
    await act(async () => nextBootstrap.resolve("account_2"));
    expect(auth.isAuthenticated).toBe(true);
    expect(mocks.cloudWrite).toHaveBeenCalledOnce();
  });

  it("keeps cloud writes paused until Convex confirms auth and creates the account row", async () => {
    let resolveRefresh!: (value: unknown) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    await mount();
    expect(credentials.user?.id).toBe(user.id);
    expect(credentials.isAuthenticated).toBe(false);
    expect(auth.canUseApp).toBe(true);
    expect(auth.accountStatus).toBe("connecting");
    expect(credentials.isResolvingSession).toBe(true);
    expect(mocks.cloudWrite).not.toHaveBeenCalled();

    await act(async () =>
      resolveRefresh({ ok: true, json: async () => tokenResponse }),
    );
    expect(credentials.isAuthenticated).toBe(true);
    expect(credentials.isResolvingSession).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
    expect(mocks.bootstrap).not.toHaveBeenCalled();

    mocks.auth.isAuthenticated = true;
    await update();
    expect(mocks.bootstrap).toHaveBeenCalledOnce();
    expect(auth.isAuthenticated).toBe(false);
    expect(mocks.cloudWrite).not.toHaveBeenCalled();

    mocks.account = { workosId: user.id };
    await update();
    expect(auth.isAuthenticated).toBe(true);
    expect(mocks.cloudWrite).toHaveBeenCalledOnce();
  });

  it("surfaces bootstrap failure and retries without signing out or losing local access", async () => {
    mocks.auth.isAuthenticated = true;
    mocks.bootstrap.mockRejectedValueOnce(
      new Error("verification unavailable"),
    );
    await mount();
    expect(auth.accountStatus).toBe("error");
    expect(auth.canUseApp).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
    await act(async () => {
      await auth.retryAccountConnection();
    });
    expect(mocks.bootstrap.mock.calls.length).toBeGreaterThan(1);
    mocks.account = { workosId: user.id };
    await update();
    expect(auth.accountStatus).toBe("ready");
  });

  it("does not treat a cached profile as authenticated when session refresh fails", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    await mount();
    expect(auth.user?.id).toBe(user.id);
    expect(credentials.isAuthenticated).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.accountStatus).toBe("error");
    expect(auth.canUseApp).toBe(true);
    expect(mocks.cloudWrite).not.toHaveBeenCalled();
  });

  it("times out a stuck account connection so settings can offer recovery", async () => {
    vi.useFakeTimers();
    mocks.auth.isAuthenticated = true;
    mocks.account = undefined;
    await mount();
    expect(auth.accountStatus).toBe("connecting");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(auth.accountStatus).toBe("error");
    expect(auth.canUseApp).toBe(true);
  });

  it("pauses cloud writes immediately on token rejection and sign-out", async () => {
    mocks.auth.isAuthenticated = true;
    mocks.account = { workosId: user.id };
    await mount();
    expect(auth.isAuthenticated).toBe(true);
    mocks.auth.isRefreshing = true;
    await update();
    expect(auth.isAuthenticated).toBe(false);
    await act(async () => {
      await auth.signOut();
    });
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
  });

  it("does not enable cloud access for another account's cached row", async () => {
    mocks.auth.isAuthenticated = true;
    mocks.account = { workosId: "another-user" };
    await mount();
    expect(auth.isAuthenticated).toBe(false);
    expect(mocks.cloudWrite).not.toHaveBeenCalled();
  });
});
