import { NextResponse } from "next/server";

/**
 * Apple App Site Association — what makes a tapped
 * `https://workout.plutotom.com/share/<token>` link open the iOS app instead of
 * Safari.
 *
 * Served from `/.well-known/apple-app-site-association` via a rewrite in
 * `next.config.ts`, because Apple fetches that exact path, unredirected, with a
 * JSON content type.
 *
 * Requires `APPLE_TEAM_ID` (the 10-character Apple Developer Team ID, not a
 * secret) in the environment. Without it we 404 rather than publish an
 * association naming the wrong team, which iOS would silently cache.
 */
export const dynamic = "force-dynamic";

const BUNDLE_ID =
  process.env.APPLE_BUNDLE_ID ?? "com.isaiahproctor.workout.local";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) {
    return new NextResponse("Not configured", { status: 404 });
  }

  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [`${teamId}.${BUNDLE_ID}`],
            // Only share links are claimed. Everything else — sign-in, the
            // WorkOS callback, the marketing page — must stay in the browser.
            components: [{ "/": "/share/*", comment: "Shared workouts" }],
          },
        ],
      },
    },
    { headers: { "content-type": "application/json" } },
  );
}
