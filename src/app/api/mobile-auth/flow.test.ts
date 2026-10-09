import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  authorize: vi.fn(),
  refresh: vi.fn(),
  callback: {} as Record<string, unknown>,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookies.has(name) ? { value: mocks.cookies.get(name) } : undefined,
    set: (name: string, value: string) => {
      mocks.cookies.set(name, value);
    },
    delete: (name: string) => {
      mocks.cookies.delete(name);
    },
  }),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  getSignInUrl: mocks.authorize,
  getWorkOS: () => ({
    userManagement: { authenticateWithRefreshToken: mocks.refresh },
  }),
  handleAuth:
    (options: { onSuccess: (data: unknown) => Promise<void> }) => async () => {
      // The SDK saves its browser cookie before invoking the application's hook.
      mocks.cookies.set("wos-session", "browser-copy");
      await options.onSuccess(mocks.callback);
    },
}));

import { GET as start } from "./start/route";
import { GET as callback } from "../../callback/route";
import { GET as complete } from "./complete/route";
import { POST as exchange } from "./exchange/route";
import { POST as refresh } from "./token/route";

beforeEach(() => {
  vi.stubEnv("MOBILE_AUTH_ENABLED", "true");
  vi.stubEnv(
    "WORKOS_COOKIE_PASSWORD",
    "local-test-password-with-at-least-32-characters",
  );
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  vi.stubEnv("WORKOS_COOKIE_NAME", "wos-session");
  mocks.cookies.clear();
  mocks.authorize
    .mockReset()
    .mockResolvedValue("https://auth.example.com/sign-in");
  mocks.refresh.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
function post(path: string, body: unknown) {
  return new Request(`https://workout.example.com/api/mobile-auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

it.each([true, false])(
  "completes popup login and cold-launch refresh (proof-bound: %s)",
  async (bound) => {
    const verifier = "v".repeat(64);
    const challenge = createHash("sha256").update(verifier).digest("hex");
    const started = await start(
      new Request(
        `https://workout.example.com/api/mobile-auth/start${bound ? `?challenge=${challenge}` : ""}`,
      ),
    );
    expect(started.headers.get("location")).toBe(
      "https://auth.example.com/sign-in",
    );
    const authorization = mocks.authorize.mock.calls[0][0];
    const user = { id: "user_1", email: "athlete@example.com" };
    mocks.callback = {
      state: authorization.state,
      user,
      accessToken: "initial-access",
      refreshToken: "initial-refresh",
    };
    await callback(new NextRequest("https://workout.example.com/callback"));
    expect(mocks.cookies.get("wos-session")).toBe("");
    const completed = await complete(
      new Request(`https://workout.example.com${authorization.returnTo}`),
    );
    const deepLink = new URL(completed.headers.get("location")!);
    expect(
      `${deepLink.protocol}//${deepLink.hostname}${deepLink.pathname}`,
    ).toBe("workout://auth/callback");
    expect(mocks.cookies.has("workout_mobile_auth_exchange")).toBe(false);
    const code = deepLink.searchParams.get("code");
    if (bound) {
      expect((await exchange(post("exchange", { code }))).status).toBe(401);
      expect(
        (await exchange(post("exchange", { code, verifier: "x".repeat(64) })))
          .status,
      ).toBe(401);
    }
    const exchanged = await exchange(
      post("exchange", { code, ...(bound ? { verifier } : {}) }),
    );
    expect(exchanged.status).toBe(200);
    const saved = await exchanged.json();
    expect(saved.user).toEqual(user);
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const accessToken = `header.${Buffer.from(JSON.stringify({ exp: expires })).toString("base64url")}.signature`;
    mocks.refresh.mockResolvedValue({
      user,
      accessToken,
      refreshToken: "rotated-refresh",
    });
    const reopened = await refresh(post("token", { session: saved.session }));
    expect(reopened.status).toBe(200);
    expect(await reopened.json()).toMatchObject({
      accessToken,
      user,
      expiresAt: expires * 1000,
    });
    expect(mocks.refresh).toHaveBeenCalledWith({
      clientId: "client_test",
      refreshToken: "initial-refresh",
    });
  },
);

it("rejects malformed proof challenges before opening WorkOS", async () => {
  const response = await start(
    new Request(
      "https://workout.example.com/api/mobile-auth/start?challenge=invalid",
    ),
  );
  expect(response.status).toBe(400);
  expect(mocks.authorize).not.toHaveBeenCalled();
});
