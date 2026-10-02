import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/lib/mobile-auth-session", () => ({
  accessForMobileSession: mocks.refresh,
}));
vi.mock("@/lib/mobile-auth", () => ({
  mobileAuthEnabled: () => true,
  mobileAuthHeaders: { "Cache-Control": "no-store" },
}));

import { POST } from "./route";

const workosRequire = createRequire(
  import.meta.resolve("@workos-inc/authkit-nextjs"),
);
const { UnauthorizedException, OauthException } =
  workosRequire("@workos-inc/node");

describe("mobile token route failures", () => {
  it.each([
    ["invalid server API key", new UnauthorizedException("review-request")],
    [
      "invalid server client id",
      new OauthException(
        400,
        "review-request",
        "invalid_client",
        "Client authentication failed",
      ),
    ],
  ])("keeps the user's session retryable for %s", async (_name, error) => {
    mocks.refresh.mockRejectedValueOnce(error);
    const response = await POST(
      new Request("https://workout.example.com/api/mobile-auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: "valid-user-session",
          forceRefresh: true,
        }),
      }),
    );
    expect(response.status).toBe(503);
  });
  it("returns 401 for an actual WorkOS invalid_grant rejection", async () => {
    mocks.refresh.mockRejectedValueOnce(
      new OauthException(
        400,
        "review-request",
        "invalid_grant",
        "Invalid refresh token",
      ),
    );
    const response = await POST(
      new Request("https://workout.example.com/api/mobile-auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: "expired-session" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Session expired" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
