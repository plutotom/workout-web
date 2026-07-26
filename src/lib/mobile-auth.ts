import type { Session } from "@workos-inc/authkit-nextjs";

type MobileAuthSession = {
  session: string;
  accessToken: string;
  user: Session["user"];
  expiresAt: number;
};

declare global {
  var __workoutMobileAuthSessions: Map<string, MobileAuthSession> | undefined;
}

const sessions =
  globalThis.__workoutMobileAuthSessions ??
  (globalThis.__workoutMobileAuthSessions = new Map());

/** The native bridge is intentionally a local-development facility. */
export function mobileAuthEnabled() {
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

function removeExpired() {
  const now = Date.now();
  for (const [code, entry] of sessions) {
    if (entry.expiresAt <= now) sessions.delete(code);
  }
}

export function storeMobileAuthSession(
  code: string,
  value: Omit<MobileAuthSession, "expiresAt">,
) {
  removeExpired();
  sessions.set(code, { ...value, expiresAt: Date.now() + 5 * 60_000 });
}

export function hasMobileAuthSession(code: string) {
  removeExpired();
  return sessions.has(code);
}

export function takeMobileAuthSession(code: string) {
  removeExpired();
  const entry = sessions.get(code);
  if (entry) sessions.delete(code);
  return entry;
}
