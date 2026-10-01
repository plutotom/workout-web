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
  readMobileSession,
} from "./mobile-auth-session";
import { mobileSessionErrorStatus } from "./mobile-session-error";

const password = "mobile-session-test-password-1234567890";
beforeEach(() => {
  vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  mocks.refresh.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("sealed mobile session validation", () => {
  it.each([
    {},
    { accessToken: "token" },
    { accessToken: "token", refreshToken: "refresh", user: {} },
  ])(
    "rejects an incomplete sealed session before calling WorkOS: %j",
    async (value) => {
      const sealed = await sealData(value, { password, ttl: 0 });
      await expect(accessForMobileSession(sealed)).rejects.toMatchObject({
        code: "invalid_session",
      });
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );
  it("treats an unreadable seal as an invalid session", async () => {
    try {
      await readMobileSession("not-a-seal");
      expect.fail("The seal should be rejected");
    } catch (error) {
      expect(mobileSessionErrorStatus(error)).toBe(401);
    }
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("keeps a missing sealing password retryable", async () => {
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", "");
    try {
      await readMobileSession("not-a-seal");
      expect.fail("Missing configuration should fail");
    } catch (error) {
      expect(mobileSessionErrorStatus(error)).toBe(503);
    }
  });
});
