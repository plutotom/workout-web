export function requirePublicConfig() {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  if (!convexUrl || !webUrl) {
    throw new Error(
      "Missing EXPO_PUBLIC_CONVEX_URL or EXPO_PUBLIC_WEB_URL. Start with `pnpm ios` from the repository root.",
    );
  }
  return { convexUrl, webUrl: webUrl.replace(/\/$/, "") };
}
