import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  mobileAuthEnabled,
  redeemMobileAuthExchangeTicket,
  resolveMobileAuthCallbackOrigin,
  sealMobileAuthExchange,
  unsealMobileAuthExchange,
} from "./mobile-auth";

const password = "test-workos-cookie-password-32chars!!";

const payload = {
  session: "sealed-session",
  accessToken: "access-token",
  user: { id: "user_1", email: "person@example.com" },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("mobile auth exchange tickets", () => {
  it("seals and redeems a one-time ticket", async () => {
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
    const ticket = await sealMobileAuthExchange(
      "11111111-1111-1111-1111-111111111111",
      payload as Parameters<typeof sealMobileAuthExchange>[1],
    );
    const redeemed = await redeemMobileAuthExchangeTicket(ticket);
    expect(redeemed?.session).toBe("sealed-session");
    expect(redeemed?.accessToken).toBe("access-token");
  });

  it("expires tickets after five minutes", async () => {
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const ticket = await sealMobileAuthExchange(
      "22222222-2222-2222-2222-222222222222",
      payload as Parameters<typeof sealMobileAuthExchange>[1],
    );
    expect(await unsealMobileAuthExchange(ticket)).not.toBeNull();
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(await unsealMobileAuthExchange(ticket)).toBeNull();
  });
});

describe("mobile auth callback origin", () => {
  it("keeps the localhost port wildcard limited to WorkOS development", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../convex.json", import.meta.url), "utf8"),
    );
    expect(config.authKit.dev.configure.redirectUris).toContain(
      "http://localhost:*/callback",
    );
    expect(config.authKit.prod.configure.redirectUris).not.toContain(
      "http://localhost:*/callback",
    );
  });

  it("allows an explicit localhost relay", () => {
    expect(
      resolveMobileAuthCallbackOrigin(
        "http://localhost:4272",
        "http://localhost:4271",
      ),
    ).toBe("http://localhost:4271");
  });

  it("rejects remote, credentialed, and invalid callback origins", () => {
    const current = "http://localhost:4272";
    expect(
      resolveMobileAuthCallbackOrigin(current, "https://attacker.example"),
    ).toBe(current);
    expect(
      resolveMobileAuthCallbackOrigin(
        current,
        "http://user:pass@localhost:4271",
      ),
    ).toBe(current);
    expect(resolveMobileAuthCallbackOrigin(current, "not a url")).toBe(current);
  });
});

describe("mobileAuthEnabled", () => {
  it("defaults off in production unless explicitly enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MOBILE_AUTH_ENABLED", "");
    expect(mobileAuthEnabled()).toBe(false);
    vi.stubEnv("MOBILE_AUTH_ENABLED", "true");
    expect(mobileAuthEnabled()).toBe(true);
  });
});
