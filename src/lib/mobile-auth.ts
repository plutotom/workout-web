import { createHash, randomUUID } from "node:crypto";

import { sealData, unsealData } from "iron-session";
import type { Session } from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";

type MobileAuthSession = {
  session: string;
  accessToken: string;
  user: Session["user"];
};

type MobileAuthExchangeTicket = MobileAuthSession & {
  code: string;
  exp: number;
};

const EXCHANGE_COOKIE = "workout_mobile_auth_exchange";
const EXCHANGE_TTL_MS = 5 * 60_000;

function cookiePassword() {
  const password = process.env.WORKOS_COOKIE_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("WORKOS_COOKIE_PASSWORD is not configured");
  }
  return password;
}

/**
 * Local/dev stays on by default. Production (and Vercel preview) require an
 * explicit opt-in so the native bridge is not accidentally public.
 */
export function mobileAuthEnabled() {
  if (process.env.MOBILE_AUTH_ENABLED === "true") return true;
  if (process.env.MOBILE_AUTH_ENABLED === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export const mobileAuthHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

/**
 * WorkOS sandbox apps often allowlist one localhost callback port. Native dev
 * builds may request that loopback origin while a tiny local relay forwards
 * the callback into this worktree's Next process. Never accept a non-loopback
 * callback here.
 */
export function resolveMobileAuthCallbackOrigin(
  requestOrigin: string,
  candidate: string | null,
) {
  if (!candidate) return requestOrigin;
  try {
    const value = new URL(candidate);
    const loopback =
      value.hostname === "localhost" || value.hostname === "127.0.0.1";
    if (
      value.protocol !== "http:" ||
      !loopback ||
      value.username ||
      value.password
    ) {
      return requestOrigin;
    }
    return value.origin;
  } catch {
    return requestOrigin;
  }
}

export function newMobileAuthCode() {
  return randomUUID();
}

/** Fingerprint for logs — never log the sealed ticket itself. */
export function mobileAuthCodeFingerprint(code: string) {
  return createHash("sha256").update(code).digest("hex").slice(0, 12);
}

export async function sealMobileAuthExchange(
  code: string,
  value: MobileAuthSession,
) {
  const ticket: MobileAuthExchangeTicket = {
    ...value,
    code,
    exp: Date.now() + EXCHANGE_TTL_MS,
  };
  return sealData(ticket, { password: cookiePassword(), ttl: 0 });
}

export async function unsealMobileAuthExchange(ticket: string) {
  const value = await unsealData<MobileAuthExchangeTicket>(ticket, {
    password: cookiePassword(),
  });
  if (
    !value?.code ||
    !value.session ||
    !value.accessToken ||
    !value.user ||
    typeof value.exp !== "number"
  ) {
    return null;
  }
  if (value.exp <= Date.now()) return null;
  return value;
}

/** Persist the exchange on the AuthKit browser session until /complete runs. */
export async function storeMobileAuthSession(
  code: string,
  value: MobileAuthSession,
) {
  const ticket = await sealMobileAuthExchange(code, value);
  const jar = await cookies();
  jar.set(EXCHANGE_COOKIE, ticket, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.ceil(EXCHANGE_TTL_MS / 1000),
    path: "/",
  });
}

export async function hasMobileAuthSession(code: string) {
  const jar = await cookies();
  const raw = jar.get(EXCHANGE_COOKIE)?.value;
  if (!raw) return false;
  const ticket = await unsealMobileAuthExchange(raw);
  return Boolean(ticket && ticket.code === code);
}

/**
 * Read + clear the browser exchange cookie, returning a sealed ticket the
 * native app can redeem via POST /api/mobile-auth/exchange (serverless-safe).
 */
export async function takeMobileAuthExchangeTicket(code: string) {
  const jar = await cookies();
  const raw = jar.get(EXCHANGE_COOKIE)?.value;
  jar.delete(EXCHANGE_COOKIE);
  if (!raw) return null;
  const ticket = await unsealMobileAuthExchange(raw);
  if (!ticket || ticket.code !== code) return null;
  return raw;
}

export async function redeemMobileAuthExchangeTicket(ticket: string) {
  const value = await unsealMobileAuthExchange(ticket);
  if (!value) return null;
  return {
    session: value.session,
    accessToken: value.accessToken,
    user: value.user,
  };
}
