import { withAuth } from "@workos-inc/authkit-nextjs";

/**
 * Web requests use the AuthKit cookie. The local native app supplies the same
 * short-lived WorkOS access token after exchanging its Keychain session.
 * Convex performs the authoritative JWT verification on the first query.
 */
export async function accessTokenForRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token) return token;
  }
  const auth = await withAuth();
  return auth.accessToken ?? null;
}
