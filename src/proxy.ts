import { authkitProxy } from "@workos-inc/authkit-nextjs";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

const workosProxy = authkitProxy({
  middlewareAuth: {
    enabled: true,
    // Public marketing home plus auth/MCP endpoints. Everything else requires
    // a session; `/` is the landing page for unsigned visitors.
    unauthenticatedPaths: [
      "/",
      "/sign-in",
      "/sign-up",
      "/sign-out",
      "/callback",
      "/api/mobile-auth/start",
      "/api/mobile-auth/complete",
      "/api/mobile-auth/exchange",
      "/api/mobile-auth/token",
      "/api/ai/templates/generate",
      "/api/ai/session/generate",
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
