import { getWorkOS, type Session } from "@workos-inc/authkit-nextjs";
import { sealData, unsealData } from "iron-session";

function cookiePassword() {
  const password = process.env.WORKOS_COOKIE_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("WORKOS_COOKIE_PASSWORD is not configured");
  }
  return password;
}

export async function readMobileSession(value: string) {
  return unsealData<Session>(value, { password: cookiePassword() });
}

export async function sealMobileSession(session: Session) {
  return sealData(session, { password: cookiePassword(), ttl: 0 });
}

function tokenExpiresSoon(accessToken: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString(
        "utf8",
      ),
    ) as { exp?: number };
    return !payload.exp || payload.exp * 1000 <= Date.now() + 60_000;
  } catch {
    return true;
  }
}

export async function accessForMobileSession(
  sealed: string,
  forceRefresh = false,
) {
  const existing = await readMobileSession(sealed);
  if (!forceRefresh && !tokenExpiresSoon(existing.accessToken)) {
    return {
      session: sealed,
      accessToken: existing.accessToken,
      user: existing.user,
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
  };
}
