import { z } from "zod";

import {
  accessForMobileSession,
  isMobileSessionExpired,
} from "@/lib/mobile-auth-session";
import { mobileAuthEnabled, mobileAuthHeaders } from "@/lib/mobile-auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  session: z.string().min(1),
  forceRefresh: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!mobileAuthEnabled()) {
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: mobileAuthHeaders },
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid session request" },
      { status: 400, headers: mobileAuthHeaders },
    );
  }
  try {
    return Response.json(
      await accessForMobileSession(
        parsed.data.session,
        parsed.data.forceRefresh ?? false,
      ),
      { headers: mobileAuthHeaders },
    );
  } catch (error) {
    if (isMobileSessionExpired(error)) {
      return Response.json(
        { error: "Session expired", code: "session_expired" },
        { status: 401, headers: mobileAuthHeaders },
      );
    }
    // SDK errors may contain request data. Log only diagnostic identifiers,
    // never the sealed session, access token, or refresh token.
    const failure = error as { status?: unknown; requestID?: unknown } | null;
    console.error("Mobile session refresh temporarily unavailable", {
      status: typeof failure?.status === "number" ? failure.status : undefined,
      requestId:
        typeof failure?.requestID === "string" ? failure.requestID : undefined,
    });
    return Response.json(
      {
        error: "Account connection temporarily unavailable",
        code: "retry_later",
      },
      { status: 503, headers: { ...mobileAuthHeaders, "Retry-After": "1" } },
    );
  }
}
