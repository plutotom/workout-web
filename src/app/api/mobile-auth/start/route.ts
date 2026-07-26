import { randomUUID } from "node:crypto";

import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import {
  mobileAuthEnabled,
  mobileAuthHeaders,
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
  const code = randomUUID();
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const callbackOrigin = resolveMobileAuthCallbackOrigin(
    origin,
    requestUrl.searchParams.get("callback_origin"),
  );
  const returnTo = `/api/mobile-auth/complete?code=${encodeURIComponent(code)}`;
  const authorizationUrl = await getSignInUrl({
    redirectUri: `${callbackOrigin}/callback`,
    returnTo,
    state: `mobile:${code}`,
  });
  const response = NextResponse.redirect(authorizationUrl);
  for (const [key, value] of Object.entries(mobileAuthHeaders))
    response.headers.set(key, value);
  return response;
}
