import { z } from "zod";

import {
  mobileAuthEnabled,
  mobileAuthHeaders,
  takeMobileAuthSession,
} from "@/lib/mobile-auth";

export const runtime = "nodejs";

const bodySchema = z.object({ code: z.string().uuid() });

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
      { error: "Invalid exchange code" },
      { status: 400, headers: mobileAuthHeaders },
    );
  }
  const result = takeMobileAuthSession(parsed.data.code);
  if (!result) {
    return Response.json(
      { error: "The exchange code is invalid or expired" },
      { status: 401, headers: mobileAuthHeaders },
    );
  }
  return Response.json(
    {
      session: result.session,
      accessToken: result.accessToken,
      user: result.user,
    },
    { headers: mobileAuthHeaders },
  );
}
