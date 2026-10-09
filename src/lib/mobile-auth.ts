import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { sealData, unsealData } from "iron-session";
import type { Session } from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";

type MobileAuthSession = {
  session: string;
  accessToken: string;
  user: Session["user"];
};

type MobileAuthExchangeTicket = {
  session: string;
  code: string;
  exp: number;
  challenge?: string;
  // Legacy tickets included these fields. Keep them optional so an in-flight
  // exchange created before deployment can still be redeemed.
  accessToken?: string;
  user?: Session["user"];
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
  challenge?: string,
) {
  // Keep the browser cookie compact. The sealed session already contains the
  // access token and user, so duplicating them here can exceed the 4 KB cookie
  // limit when WorkOS tokens are large.
  const ticket: MobileAuthExchangeTicket = {
    session: value.session,
    code,
    exp: Date.now() + EXCHANGE_TTL_MS,
    challenge,
  };
  return sealData(ticket, { password: cookiePassword(), ttl: 0 });
}

export async function unsealMobileAuthExchange(ticket: string) {
  const value = await unsealData<MobileAuthExchangeTicket>(ticket, {
    password: cookiePassword(),
  });
  if (!value?.code || !value.session || typeof value.exp !== "number") {
    return null;
  }
  if (value.exp <= Date.now()) return null;
  return value;
}

/** Persist the exchange on the AuthKit browser session until /complete runs. */
export async function storeMobileAuthSession(
  code: string,
  value: MobileAuthSession,
  challenge?: string,
) {
  const ticket = await sealMobileAuthExchange(code, value, challenge);
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

export async function redeemMobileAuthExchangeTicket(
  ticket: string,
  verifier?: string,
) {
  const value = await unsealMobileAuthExchange(ticket);
  if (!value) return null;
  // The proof stays in the initiating app, never in the browser or deep link.
  // Redemption is deliberately retryable if a network response is lost.
  // Legacy apps have no challenge; keep their sign-in working during rollout.
  if (verifier && !value.challenge) return null;
  if (value.challenge) {
    if (!verifier || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return null;
    const expected = Buffer.from(value.challenge, "hex");
    const actual = createHash("sha256").update(verifier).digest();
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return null;
  }
  if (value.accessToken && value.user) {
    return {
      session: value.session,
      accessToken: value.accessToken,
      user: value.user,
    };
  }
  const session = await unsealData<Session>(value.session, {
    password: cookiePassword(),
  });
  if (!session?.accessToken || !session.user) return null;
  return {
    session: value.session,
    accessToken: session.accessToken,
    user: session.user,
  };
}
