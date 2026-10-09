import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { sealData } from "iron-session";
import { createHash } from "node:crypto";

import {
  mobileAuthEnabled,
  redeemMobileAuthExchangeTicket,
  resolveMobileAuthCallbackOrigin,
  sealMobileAuthExchange,
  unsealMobileAuthExchange,
} from "./mobile-auth";

const password = "test-workos-cookie-password-32chars!!";

async function testPayload() {
  const user = {
    id: "user_1",
    email: "person@example.com",
  } as Parameters<typeof sealMobileAuthExchange>[1]["user"];
  const session = await sealData(
    { accessToken: "access-token", refreshToken: "refresh-token", user },
    { password, ttl: 0 },
  );
  return { session, accessToken: "access-token", user };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("mobile auth exchange tickets", () => {
  it("keeps legacy app exchange tickets compatible during rollout", async () => {
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
    const payload = await testPayload();
    const ticket = await sealMobileAuthExchange(
      "11111111-1111-1111-1111-111111111111",
      payload as Parameters<typeof sealMobileAuthExchange>[1],
    );
    const redeemed = await redeemMobileAuthExchangeTicket(ticket);
    expect(redeemed?.session).toBe(payload.session);
    expect(redeemed?.accessToken).toBe("access-token");
    // A new client must never accept an unbound legacy ticket injected into
    // the callback for its proof-bound sign-in attempt.
    expect(
      await redeemMobileAuthExchangeTicket(ticket, "a".repeat(64)),
    ).toBeNull();
  });

  it("requires the initiating app's proof and permits a lost-response retry", async () => {
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
    const verifier = "a".repeat(64);
    const challenge = createHash("sha256").update(verifier).digest("hex");
    const payload = await testPayload();
    const ticket = await sealMobileAuthExchange(
      "bound-code",
      payload,
      challenge,
    );
    expect(await redeemMobileAuthExchangeTicket(ticket)).toBeNull();
    expect(
      await redeemMobileAuthExchangeTicket(ticket, "b".repeat(64)),
    ).toBeNull();
    expect(await redeemMobileAuthExchangeTicket(ticket, verifier)).toEqual(
      payload,
    );
    expect(await redeemMobileAuthExchangeTicket(ticket, verifier)).toEqual(
      payload,
    );
  });

  it("expires tickets after five minutes", async () => {
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const payload = await testPayload();
    const ticket = await sealMobileAuthExchange(
      "22222222-2222-2222-2222-222222222222",
      payload as Parameters<typeof sealMobileAuthExchange>[1],
    );
    expect(await unsealMobileAuthExchange(ticket)).not.toBeNull();
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(await unsealMobileAuthExchange(ticket)).toBeNull();
  });

  it("keeps the exchange ticket compact enough for a browser cookie", async () => {
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
    const user = {
      id: "user_1",
      email: "person@example.com",
    } as Parameters<typeof sealMobileAuthExchange>[1]["user"];
    const accessToken = "a".repeat(1200);
    const session = await sealData(
      { accessToken, refreshToken: "r".repeat(500), user },
      { password, ttl: 0 },
    );
    const ticket = await sealMobileAuthExchange(
      "33333333-3333-3333-3333-333333333333",
      { session, accessToken, user },
    );
    expect(ticket.length).toBeLessThan(4096);
  });

  it("rejects a slim ticket whose nested session is missing credentials", async () => {
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
    const session = await sealData(
      { refreshToken: "refresh-token" },
      { password, ttl: 0 },
    );
    const ticket = await sealMobileAuthExchange(
      "44444444-4444-4444-4444-444444444444",
      {
        session,
        accessToken: "unused",
        user: {
          id: "user_1",
          email: "person@example.com",
        } as Parameters<typeof sealMobileAuthExchange>[1]["user"],
      },
    );
    expect(await redeemMobileAuthExchangeTicket(ticket)).toBeNull();
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
