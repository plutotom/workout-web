import { NextResponse } from "next/server";

import {
  mobileAuthEnabled,
  mobileAuthHeaders,
  takeMobileAuthExchangeTicket,
} from "@/lib/mobile-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!mobileAuthEnabled()) {
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: mobileAuthHeaders },
    );
  }
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!code) {
    return Response.json(
      { error: "The mobile sign-in session expired. Please try again." },
      { status: 400, headers: mobileAuthHeaders },
    );
  }
  const ticket = await takeMobileAuthExchangeTicket(code);
  if (!ticket) {
    return Response.json(
      { error: "The mobile sign-in session expired. Please try again." },
      { status: 400, headers: mobileAuthHeaders },
    );
  }
  const target = new URL("workout://auth/callback");
  target.searchParams.set("code", ticket);
  const response = NextResponse.redirect(target);
  for (const [key, value] of Object.entries(mobileAuthHeaders))
    response.headers.set(key, value);
  return response;
}
