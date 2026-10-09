import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import {
  mobileAuthEnabled,
  mobileAuthHeaders,
  newMobileAuthCode,
  resolveMobileAuthCallbackOrigin,
} from "@/lib/mobile-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!mobileAuthEnabled()) {
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: mobileAuthHeaders },
    );
  }
  const code = newMobileAuthCode();
  const requestUrl = new URL(request.url);
  const challenge = requestUrl.searchParams.get("challenge");
  if (challenge !== null && !/^[a-f0-9]{64}$/.test(challenge)) {
    return Response.json(
      { error: "Invalid sign-in challenge" },
      { status: 400, headers: mobileAuthHeaders },
    );
  }
  const origin = requestUrl.origin;
  const callbackOrigin = resolveMobileAuthCallbackOrigin(
    origin,
    requestUrl.searchParams.get("callback_origin"),
  );
  const returnTo = `/api/mobile-auth/complete?code=${encodeURIComponent(code)}`;
  const authorizationUrl = await getSignInUrl({
    redirectUri: `${callbackOrigin}/callback`,
    returnTo,
    state: `mobile:${code}${challenge ? `:${challenge}` : ""}`,
  });
  const response = NextResponse.redirect(authorizationUrl);
  for (const [key, value] of Object.entries(mobileAuthHeaders))
    response.headers.set(key, value);
  return response;
}
