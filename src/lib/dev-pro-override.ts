/** Dev-only: force Pro/Free for local testing without changing billing or DB. */

declare const __DEV__: boolean | undefined;

export type DevProOverride = "server" | "free" | "pro";

export type DevEntitlement = {
  isPro: boolean;
  isAdmin: boolean;
  plan: "free" | "pro";
  allowManualPro: boolean;
  billingConfigured: boolean;
  subscription: {
    status: string;
    productKey: string | null;
    productName: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

const STORAGE_KEY = "workout:dev:proOverride";
export const DEV_PRO_OVERRIDE_COOKIE = "workout-dev-pro-override";
export const DEV_PRO_OVERRIDE_HEADER = "x-dev-pro-override";

const SYNTHETIC_ENTITLEMENT: DevEntitlement = {
  isPro: false,
  isAdmin: false,
  plan: "free",
  allowManualPro: false,
  billingConfigured: false,
  subscription: null,
};

let memoryOverride: DevProOverride = "server";
const listeners = new Set<() => void>();

export function devProOverrideAllowed(): boolean {
  const nodeEnvironment =
    typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
  if (nodeEnvironment === "production") return false;
  // Native release builds must ignore even a persisted development override.
  if (typeof __DEV__ !== "undefined") return __DEV__ === true;
  // An absent/unknown build environment must never enable privilege overrides.
  return nodeEnvironment === "development";
}

function parseOverride(raw: string | null | undefined): DevProOverride {
  if (raw === "pro" || raw === "free") return raw;
  return "server";
}

export function readDevProOverride(): DevProOverride {
  if (!devProOverrideAllowed()) return "server";
  if (typeof localStorage !== "undefined") {
    return parseOverride(localStorage.getItem(STORAGE_KEY));
  }
  return memoryOverride;
}

export function writeDevProOverride(value: DevProOverride): void {
  if (!devProOverrideAllowed()) return;
  memoryOverride = value;
  if (typeof localStorage !== "undefined") {
    if (value === "server") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
    }
  }
  syncDevProOverrideCookie(value);
  for (const listener of listeners) {
    listener();
  }
}

/** Keeps Next.js AI routes in sync with the dev toggle (same-origin fetch sends cookies). */
export function syncDevProOverrideCookie(value: DevProOverride): void {
  if (typeof document === "undefined" || !devProOverrideAllowed()) return;
  if (value === "server") {
    document.cookie = `${DEV_PRO_OVERRIDE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${DEV_PRO_OVERRIDE_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

export function subscribeDevProOverride(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function devProOverrideHeaderValue(
  override: DevProOverride,
): string | undefined {
  if (!devProOverrideAllowed() || override === "server") return undefined;
  return override;
}

export function applyDevProEntitlementOverride<
  T extends DevEntitlement | null | undefined,
>(entitlement: T, override: DevProOverride): T | DevEntitlement {
  if (!devProOverrideAllowed() || override === "server") {
    return entitlement as T;
  }

  const isPro = override === "pro";
  const plan = isPro ? "pro" : "free";

  if (entitlement === null || entitlement === undefined) {
    return { ...SYNTHETIC_ENTITLEMENT, isPro, plan };
  }

  return { ...entitlement, isPro, plan };
}
