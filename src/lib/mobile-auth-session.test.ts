import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sealData } from "iron-session";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({
    userManagement: { authenticateWithRefreshToken: mocks.refresh },
  }),
}));
import {
  accessForMobileSession,
  sealMobileSession,
} from "./mobile-auth-session";
import { POST } from "@/app/api/mobile-auth/token/route";

const password = "test-mobile-session-password-at-least-32-characters";
const user = { id: "user_1", email: "athlete@example.com" } as Parameters<
  typeof sealMobileSession
>[0]["user"];
function token(seconds: number) {
  return `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url")}.signature`;
}
async function sealed(seconds = -1) {
  return sealMobileSession({
    user,
    accessToken: token(seconds),
    refreshToken: "private-refresh-token",
  });
}
async function request(session: string) {
  return POST(
    new Request("http://localhost/api/mobile-auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    }),
  );
}
beforeEach(() => {
  vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  vi.stubEnv("MOBILE_AUTH_ENABLED", "true");
  mocks.refresh.mockReset().mockResolvedValue({
    user,
    accessToken: token(3600),
    refreshToken: "rotated-refresh-token",
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("mobile session refresh endpoint", () => {
  it.each([
    { status: 503, message: "upstream outage" },
    { status: 429, message: "contention" },
    { status: 408, message: "timeout" },
    { status: 401, message: "server API key is invalid" },
    { status: 400, error: "invalid_client" },
    new Error("connection reset"),
  ])("keeps a saved login retryable after %j", async (error) => {
    mocks.refresh.mockRejectedValue(error);
    const result = await request(await sealed());
    expect(result.status).toBe(503);
    expect(result.headers.get("Retry-After")).toBe("1");
    expect(await result.json()).toMatchObject({ code: "retry_later" });
  });

  it.each([
    { status: 400, error: "invalid_grant" },
    { status: 400, code: "invalid_grant" },
  ])(
    "requires sign-in for confirmed invalid refresh credentials: %j",
    async (error) => {
      mocks.refresh.mockRejectedValue(error);
      const result = await request(await sealed());
      expect(result.status).toBe(401);
      expect(await result.json()).toEqual({
        error: "Session expired",
        code: "session_expired",
      });
    },
  );

  it("rejects a malformed sealed session without contacting WorkOS", async () => {
    const session = await sealData({ user }, { password, ttl: 0 });
    expect((await request(session)).status).toBe(401);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("rejects an unreadable saved credential", async () => {
    expect((await request("not-a-seal")).status).toBe(401);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("does not call a missing server configuration a user session expiry", async () => {
    const session = await sealed();
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", "");
    expect((await request(session)).status).toBe(503);
  });

  it("returns a fresh cached token with its expiry without rotating again", async () => {
    const session = await sealed(3600);
    const result = await accessForMobileSession(session);
    expect(result.session).toBe(session);
    expect(result.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("persists the replacement refresh token and honors forced refresh", async () => {
    const result = await accessForMobileSession(await sealed(3600), true);
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith({
      clientId: "client_test",
      refreshToken: "private-refresh-token",
    });
    await accessForMobileSession(result.session, true);
    expect(mocks.refresh).toHaveBeenLastCalledWith({
      clientId: "client_test",
      refreshToken: "rotated-refresh-token",
    });
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it("does not write credential-bearing SDK errors to logs", async () => {
    mocks.refresh.mockRejectedValue({
      status: 503,
      requestID: "request_test",
      rawData: { refresh_token: "secret-do-not-log" },
    });
    await request(await sealed());
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "secret-do-not-log",
    );
    expect(console.error).toHaveBeenCalledWith(expect.any(String), {
      status: 503,
      requestId: "request_test",
    });
  });
});
