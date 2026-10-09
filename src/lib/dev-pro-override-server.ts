import {
  DEV_PRO_OVERRIDE_COOKIE,
  DEV_PRO_OVERRIDE_HEADER,
  type DevProOverride,
} from "./dev-pro-override";

type EntitlementWithPro = {
  isPro: boolean;
  plan: "free" | "pro";
};

function parseDevOverride(raw: string | null | undefined): DevProOverride {
  if (raw === "pro" || raw === "free") return raw;
  return "server";
}

function devOverrideFromRequest(request: Request): DevProOverride {
  if (process.env.NODE_ENV !== "development") return "server";

  const header = request.headers.get(DEV_PRO_OVERRIDE_HEADER);
  if (header) return parseDevOverride(header.trim().toLowerCase());

  const cookie = request.headers.get("cookie");
  if (!cookie) return "server";

  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEV_PRO_OVERRIDE_COOKIE}=`));
  if (!match) return "server";

  const value = match.slice(`${DEV_PRO_OVERRIDE_COOKIE}=`.length);
  try {
    return parseDevOverride(decodeURIComponent(value));
  } catch {
    return "server";
  }
}

/** Apply the local dev Pro/Free toggle to a Convex entitlement result. */
export function applyDevProEntitlementOverrideForRequest<
  T extends EntitlementWithPro,
>(entitlement: T, request: Request): T {
  const override = devOverrideFromRequest(request);
  if (override === "server") return entitlement;
  const isPro = override === "pro";
  return {
    ...entitlement,
    isPro,
    plan: isPro ? "pro" : "free",
  };
}
