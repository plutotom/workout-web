import { z } from "zod";

import { accessForMobileSession } from "@/lib/mobile-auth-session";
import { mobileAuthEnabled, mobileAuthHeaders } from "@/lib/mobile-auth";
import { mobileSessionErrorStatus } from "@/lib/mobile-session-error";

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
    const status = mobileSessionErrorStatus(error);
    if (status === 401) {
      return Response.json(
        { error: "Session expired" },
        { status: 401, headers: mobileAuthHeaders },
      );
    }
    console.error("Mobile session refresh failed", error);
    return Response.json(
      { error: "Authentication unavailable" },
      { status: 503, headers: mobileAuthHeaders },
    );
  }
}
