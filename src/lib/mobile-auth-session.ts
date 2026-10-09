import { getWorkOS, type Session } from "@workos-inc/authkit-nextjs";
import { sealData, unsealData } from "iron-session";

export class InvalidMobileSessionError extends Error {
  constructor() {
    super("The mobile session is invalid or expired");
    this.name = "InvalidMobileSessionError";
  }
}

/** An upstream outage or a bad server credential is not a user sign-out. */
export function isMobileSessionExpired(error: unknown) {
  if (error instanceof InvalidMobileSessionError) return true;
  if (!error || typeof error !== "object") return false;
  const failure = error as { status?: number; error?: string; code?: string };
  return (
    failure.status === 400 &&
    (failure.error === "invalid_grant" || failure.code === "invalid_grant")
  );
}

function cookiePassword() {
  const password = process.env.WORKOS_COOKIE_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("WORKOS_COOKIE_PASSWORD is not configured");
  }
  return password;
}

export async function readMobileSession(value: string) {
  const session = await unsealData<Session>(value, {
    password: cookiePassword(),
    ttl: 0,
  });
  if (
    !session ||
    typeof session.accessToken !== "string" ||
    !session.accessToken ||
    typeof session.refreshToken !== "string" ||
    !session.refreshToken ||
    typeof session.user?.id !== "string" ||
    !session.user.id ||
    typeof session.user.email !== "string"
  ) {
    throw new InvalidMobileSessionError();
  }
  return session;
}

export async function sealMobileSession(session: Session) {
  return sealData(session, { password: cookiePassword(), ttl: 0 });
}

function tokenExpiresAt(accessToken: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString(
        "utf8",
      ),
    ) as { exp?: number };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : 0;
  } catch {
    return 0;
  }
}

export async function accessForMobileSession(
  sealed: string,
  forceRefresh = false,
) {
  const existing = await readMobileSession(sealed);
  if (
    !forceRefresh &&
    tokenExpiresAt(existing.accessToken) > Date.now() + 60_000
  ) {
    return {
      session: sealed,
      accessToken: existing.accessToken,
      user: existing.user,
      expiresAt: tokenExpiresAt(existing.accessToken),
    };
  }

  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId) throw new Error("WORKOS_CLIENT_ID is not configured");
  const refreshed =
    await getWorkOS().userManagement.authenticateWithRefreshToken({
      clientId,
      refreshToken: existing.refreshToken,
    });
  const session = await sealMobileSession({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    user: refreshed.user,
    impersonator: refreshed.impersonator,
    authenticationMethod: refreshed.authenticationMethod,
  });
  return {
    session,
    accessToken: refreshed.accessToken,
    user: refreshed.user,
    expiresAt: tokenExpiresAt(refreshed.accessToken),
  };
}
