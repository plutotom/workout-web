import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  hasMobileAuthSession,
  resolveMobileAuthCallbackOrigin,
  storeMobileAuthSession,
  takeMobileAuthSession,
} from "./mobile-auth";

const payload = {
  session: "sealed-session",
  accessToken: "access-token",
  user: { id: "user_1", email: "person@example.com" },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("mobile auth exchange store", () => {
  it("consumes an exchange code only once", () => {
    storeMobileAuthSession(
      "one-time",
      payload as Parameters<typeof storeMobileAuthSession>[1],
    );
    expect(takeMobileAuthSession("one-time")?.session).toBe("sealed-session");
    expect(takeMobileAuthSession("one-time")).toBeUndefined();
  });

  it("expires codes after five minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    storeMobileAuthSession(
      "expiring",
      payload as Parameters<typeof storeMobileAuthSession>[1],
    );
    expect(hasMobileAuthSession("expiring")).toBe(true);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(hasMobileAuthSession("expiring")).toBe(false);
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
