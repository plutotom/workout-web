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
 * The team and bundle ids must match `mobile/app.json` (`ios.appleTeamId` and
 * `ios.bundleIdentifier`) or iOS refuses the association — and caches the
 * refusal. They default to the values declared there so universal links work
 * out of the box; `APPLE_TEAM_ID` / `APPLE_BUNDLE_ID` override them if the app
 * is ever signed by a different team.
 */
export const dynamic = "force-dynamic";

/** Keep in sync with `mobile/app.json` → `ios.appleTeamId`. Not a secret. */
const DEFAULT_TEAM_ID = "3CVY7K9AJ6";
const BUNDLE_ID =
  process.env.APPLE_BUNDLE_ID ?? "com.isaiahproctor.workout.local";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim() || DEFAULT_TEAM_ID;
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
