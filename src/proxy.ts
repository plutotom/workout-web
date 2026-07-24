import { authkitProxy } from "@workos-inc/authkit-nextjs";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

const workosProxy = authkitProxy({
  middlewareAuth: {
    enabled: true,
    // `/` is intentionally omitted: the root redirects to /dashboard, which is
    // auth-protected, so unauthenticated visitors are sent to sign-in.
    unauthenticatedPaths: [
      "/sign-in",
      "/sign-up",
      "/sign-out",
      "/callback",
      "/api/mcp",
      "/.well-known/oauth-protected-resource",
      "/serwist",
    ],
  },
});

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const result = await workosProxy(request, event);
  const response = result ?? NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
