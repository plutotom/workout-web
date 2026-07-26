import { z } from "zod";

import { accessForMobileSession } from "@/lib/mobile-auth-session";
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
    console.error("Mobile session refresh failed", error);
    return Response.json(
      { error: "Session expired" },
      { status: 401, headers: mobileAuthHeaders },
    );
  }
}
