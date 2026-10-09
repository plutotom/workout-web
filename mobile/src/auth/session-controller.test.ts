import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthRequestError,
  LOCAL_MODE_KEY,
  MobileSessionController,
  SESSION_KEY,
  USER_KEY,
  type TokenResponse,
} from "./session-controller";

const user = { id: "user_1", email: "athlete@example.com" };
const controllers: MobileSessionController[] = [];
function response(session = "rotated-session", account = user): TokenResponse {
  return {
    session,
    accessToken: `token:${session}`,
    user: account,
    expiresAt: Date.now() + 3_600_000,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(
  values = new Map([
    [SESSION_KEY, "stored-session"],
    [USER_KEY, JSON.stringify(user)],
    [LOCAL_MODE_KEY, "1"],
  ]),
) {
  const storage = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  const request = vi
    .fn<(session: string, force: boolean) => Promise<TokenResponse>>()
    .mockImplementation(async () => response());
  const controller = new MobileSessionController(storage, request);
  controllers.push(controller);
  return { controller, request, storage, values };
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
});
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.pause());
  vi.useRealTimers();
});

describe("persistent mobile sessions", () => {
  it("restores and saves rotated credentials before resolving a cold launch", async () => {
    const { controller, request, values } = setup();
    await controller.resume();
    expect(request).toHaveBeenCalledExactlyOnceWith("stored-session", false);
    expect(values.get(SESSION_KEY)).toBe("rotated-session");
    expect(controller.getSnapshot()).toMatchObject({
      user,
      hasAccessToken: true,
      localMode: true,
      loading: false,
    });
    expect(await controller.fetchAccessToken()).toBe("token:rotated-session");
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    new Error("offline"),
    new AuthRequestError("unavailable", 503, "retry_later"),
    new AuthRequestError("rate limited", 429),
    new AuthRequestError("unexpected proxy rejection", 401),
  ])(
    "preserves credentials and recovers automatically after %s",
    async (error) => {
      const { controller, request, values, storage } = setup();
      request.mockRejectedValueOnce(error);
      await controller.resume();
      expect(values.get(SESSION_KEY)).toBe("stored-session");
      expect(storage.remove).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({
        user,
        hasAccessToken: false,
        localMode: true,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(request).toHaveBeenCalledTimes(2);
      expect(controller.getSnapshot().hasAccessToken).toBe(true);
    },
  );

  it("shares startup refresh with Convex, reconnect, and foreground recovery", async () => {
    const { controller, request } = setup();
    const pending = deferred<TokenResponse>();
    request.mockReturnValueOnce(pending.promise);
    const startup = controller.resume();
    await settle();
    const convex = controller.fetchAccessToken(true);
    const reconnect = controller.reconnect();
    const foreground = controller.resume();
    expect(request).toHaveBeenCalledOnce();
    pending.resolve(response());
    await Promise.all([startup, convex, reconnect, foreground]);
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not resurrect a session when startup finishes after sign-out", async () => {
    const { controller, request, values } = setup();
    const pending = deferred<TokenResponse>();
    request.mockReturnValueOnce(pending.promise);
    const startup = controller.resume();
    await settle();
    await controller.signOut();
    pending.resolve(response());
    await startup;
    expect(values.has(SESSION_KEY)).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      user: null,
      localMode: false,
      hasAccessToken: false,
    });
  });

  it("ignores an old refresh failure after another account signs in", async () => {
    const { controller, request, values } = setup();
    await controller.resume();
    const pending = deferred<TokenResponse>();
    request.mockReturnValueOnce(pending.promise);
    const oldRefresh = controller.fetchAccessToken(true);
    await controller.signOut();
    const nextUser = { id: "user_2", email: "next@example.com" };
    await controller.signIn(async () => response("next-session", nextUser));
    pending.reject(new AuthRequestError("expired", 401, "session_expired"));
    await oldRefresh;
    expect(values.get(SESSION_KEY)).toBe("next-session");
    expect(controller.getSnapshot().user).toEqual(nextUser);
  });

  it("finishes an in-progress Keychain write before sign-out removes it", async () => {
    const { controller, storage, values } = setup();
    const write = deferred<void>();
    storage.set.mockImplementationOnce(async (key, value) => {
      await write.promise;
      values.set(key, value);
    });
    const startup = controller.resume();
    await settle();
    expect(storage.set).toHaveBeenCalled();
    const signOut = controller.signOut();
    write.resolve();
    await Promise.all([startup, signOut]);
    expect(values.size).toBe(0);
    expect(controller.getSnapshot().user).toBeNull();
  });

  it("retries saving a rotated credential without reusing the old refresh token", async () => {
    const { controller, storage, request, values } = setup();
    storage.set.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await controller.resume();
    expect(values.get(SESSION_KEY)).toBe("stored-session");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(values.get(SESSION_KEY)).toBe("rotated-session");
    expect(request).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().hasAccessToken).toBe(true);
  });

  it("pauses retries in the background and retries immediately on return", async () => {
    const { controller, request } = setup();
    request.mockRejectedValueOnce(new Error("offline"));
    await controller.resume();
    controller.pause();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(request).toHaveBeenCalledOnce();
    await controller.resume();
    expect(request).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().hasAccessToken).toBe(true);
  });

  it("restores persisted credentials after closing the app for 30 days", async () => {
    const first = setup();
    await first.controller.resume();
    first.controller.pause();
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60_000);
    const reopened = setup(first.values);
    await reopened.controller.resume();
    expect(reopened.request).toHaveBeenCalledWith("rotated-session", false);
    expect(reopened.controller.getSnapshot().hasAccessToken).toBe(true);
  });

  it("never returns an expired cached access token during an outage", async () => {
    const { controller, request, values } = setup();
    await controller.resume();
    controller.pause();
    await vi.advanceTimersByTimeAsync(3_600_001);
    request.mockRejectedValue(new Error("offline"));
    expect(await controller.fetchAccessToken()).toBeNull();
    expect(controller.getSnapshot()).toMatchObject({
      user,
      hasAccessToken: false,
      localMode: true,
    });
    expect(values.has(SESSION_KEY)).toBe(true);
  });

  it("retries a failed forced refresh even when the rejected token has time left", async () => {
    const { controller, request } = setup();
    await controller.resume();
    request.mockRejectedValueOnce(new Error("upstream unavailable"));
    await controller.fetchAccessToken(true);
    request.mockResolvedValueOnce(response("recovered-session"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(request).toHaveBeenLastCalledWith("rotated-session", true);
    expect(await controller.fetchAccessToken()).toBe("token:recovered-session");
  });

  it("refreshes a pending saved token that expired while the app was backgrounded", async () => {
    const { controller, request, storage } = setup();
    storage.set.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await controller.resume();
    controller.pause();
    await vi.advanceTimersByTimeAsync(3_600_001);
    request.mockResolvedValueOnce(response("fresh-after-background"));
    await controller.resume();
    expect(request).toHaveBeenLastCalledWith("rotated-session", false);
    expect(await controller.fetchAccessToken()).toBe(
      "token:fresh-after-background",
    );
  });

  it("clears confirmed expired credentials while keeping local workouts accessible", async () => {
    const { controller, request, values } = setup();
    request.mockRejectedValue(
      new AuthRequestError("expired", 401, "session_expired"),
    );
    await controller.resume();
    expect(values.has(SESSION_KEY)).toBe(false);
    expect(values.get(LOCAL_MODE_KEY)).toBe("1");
    expect(controller.getSnapshot()).toMatchObject({
      user: null,
      hasAccessToken: false,
      localMode: true,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(request).toHaveBeenCalledOnce();
  });

  it("retries a locked Keychain without deleting the stored session", async () => {
    const { controller, storage, values } = setup();
    storage.get.mockRejectedValueOnce(new Error("locked"));
    await controller.resume();
    expect(values.get(SESSION_KEY)).toBe("stored-session");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(controller.getSnapshot().hasAccessToken).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("ignores a browser login that finishes after the user signs out", async () => {
    const { controller, values } = setup();
    await controller.resume();
    const browser = deferred<TokenResponse>();
    const signIn = controller.signIn(() => browser.promise);
    await controller.signOut();
    browser.resolve(response("late-login"));
    await signIn;
    expect(values.size).toBe(0);
    expect(controller.getSnapshot().user).toBeNull();
  });
});
