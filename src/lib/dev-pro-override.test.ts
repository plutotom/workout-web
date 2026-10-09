import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyDevProEntitlementOverride,
  devProOverrideAllowed,
  readDevProOverride,
  writeDevProOverride,
  devProOverrideHeaderValue,
} from "./dev-pro-override";
import { applyDevProEntitlementOverrideForRequest } from "./dev-pro-override-server";

beforeEach(() => vi.stubEnv("NODE_ENV", "development"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// exercise parse via read path
function apply(
  entitlement: {
    isPro: boolean;
    plan: "free" | "pro";
    isAdmin: boolean;
  } | null,
  override: "server" | "free" | "pro",
) {
  return applyDevProEntitlementOverride(
    entitlement === null
      ? null
      : {
          ...entitlement,
          allowManualPro: false,
          billingConfigured: false,
          subscription: null,
        },
    override,
  );
}

describe("applyDevProEntitlementOverride", () => {
  it("leaves server entitlement unchanged when override is server", () => {
    const base = {
      isPro: true,
      plan: "pro" as const,
      isAdmin: false,
      allowManualPro: false,
      billingConfigured: true,
      subscription: null,
    };
    expect(applyDevProEntitlementOverride(base, "server")).toEqual(base);
  });

  it("synthesizes entitlement when logged out and override is pro", () => {
    const result = applyDevProEntitlementOverride(null, "pro");
    expect(result).toMatchObject({ isPro: true, plan: "pro", isAdmin: false });
  });

  it("forces free when override is free", () => {
    const result = apply({ isPro: true, plan: "pro", isAdmin: true }, "free");
    expect(result).toMatchObject({ isPro: false, plan: "free", isAdmin: true });
  });
});

describe("development override request parsing", () => {
  const entitlement = { isPro: false, plan: "free" as const };
  it("ignores a malformed override cookie instead of failing the request", () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request("http://localhost/api/ai/templates/generate", {
      headers: { cookie: "workout-dev-pro-override=%" },
    });
    expect(applyDevProEntitlementOverrideForRequest(entitlement, request)).toBe(
      entitlement,
    );
  });
  it("honors a valid development override but ignores it in production", () => {
    const request = new Request("http://localhost/api/ai/templates/generate", {
      headers: { cookie: "workout-dev-pro-override=pro" },
    });
    vi.stubEnv("NODE_ENV", "development");
    expect(
      applyDevProEntitlementOverrideForRequest(entitlement, request).isPro,
    ).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(applyDevProEntitlementOverrideForRequest(entitlement, request)).toBe(
      entitlement,
    );
  });
});

describe("production override isolation", () => {
  it.each(["production", "test", "", "staging"])(
    "fails closed in %s web environments",
    (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      expect(devProOverrideAllowed()).toBe(false);
      expect(applyDevProEntitlementOverride(null, "pro")).toBeNull();
      expect(devProOverrideHeaderValue("pro")).toBeUndefined();
    },
  );
  it("ignores stored override values and never writes in a native release", () => {
    vi.stubGlobal("__DEV__", false);
    const storage = {
      getItem: vi.fn(() => "pro"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", storage);
    expect(devProOverrideAllowed()).toBe(false);
    expect(readDevProOverride()).toBe("server");
    writeDevProOverride("pro");
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(applyDevProEntitlementOverride(null, "pro")).toBeNull();
  });
  it.each(["production", "test", ""])(
    "ignores forged header and cookie on a %s server",
    (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      const free = { isPro: false, plan: "free" as const };
      const request = new Request(
        "https://workout.example/api/ai/session/generate",
        {
          headers: {
            "x-dev-pro-override": "pro",
            cookie: "workout-dev-pro-override=pro",
          },
        },
      );
      expect(applyDevProEntitlementOverrideForRequest(free, request)).toBe(
        free,
      );
    },
  );
});
