import { describe, expect, it } from "vitest";

import { mobileSessionErrorStatus } from "./mobile-session-error";

describe("mobileSessionErrorStatus", () => {
  it("returns 401 only for invalid or expired refresh tokens", () => {
    expect(
      mobileSessionErrorStatus(
        Object.assign(new Error("bad"), {
          status: 400,
          error: "invalid_grant",
        }),
      ),
    ).toBe(401);
    expect(
      mobileSessionErrorStatus(
        Object.assign(new Error("bad"), {
          status: 400,
          code: "invalid_refresh_token",
        }),
      ),
    ).toBe(401);
    expect(
      mobileSessionErrorStatus(
        Object.assign(new Error("rejected"), { code: "invalid_grant" }),
      ),
    ).toBe(401);
    expect(
      mobileSessionErrorStatus(new Error("Unable to decrypt sealed data")),
    ).toBe(401);
    expect(mobileSessionErrorStatus(new Error("invalid refresh token"))).toBe(
      401,
    );
  });

  it("returns 503 for timeouts, 5xx, and other retryable failures", () => {
    expect(
      mobileSessionErrorStatus(
        Object.assign(new Error("down"), { status: 503 }),
      ),
    ).toBe(503);
    expect(
      mobileSessionErrorStatus(
        Object.assign(new Error("busy"), { status: 429 }),
      ),
    ).toBe(503);
    expect(mobileSessionErrorStatus(new Error("fetch failed"))).toBe(503);
    expect(
      mobileSessionErrorStatus(new Error("WORKOS_CLIENT_ID is not configured")),
    ).toBe(503);
    expect(mobileSessionErrorStatus(new Error("aborted"))).toBe(503);
    for (const status of [400, 401, 403]) {
      expect(
        mobileSessionErrorStatus(Object.assign(new Error("bad"), { status })),
      ).toBe(503);
    }
    expect(
      mobileSessionErrorStatus({ status: 400, error: "invalid_client" }),
    ).toBe(503);
    expect(mobileSessionErrorStatus({ code: "client_secret_expired" })).toBe(
      503,
    );
  });
});
