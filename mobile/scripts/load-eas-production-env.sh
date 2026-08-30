#!/usr/bin/env bash
# Sourced by release / build / OTA scripts. Sets MOBILE_ROOT, REPO_ROOT, and loads
# .env.mobile.production at the repo root when present (gitignored).
#
# Requires EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_WEB_URL for local EAS bundling
# (eas build --local, eas update). Accepts NEXT_PUBLIC_* keys from the same file
# (same mapping as scripts/mobile.mjs).

export MOBILE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export REPO_ROOT="$(cd "$MOBILE_ROOT/.." && pwd)"

ENV_FILE="${MOBILE_PRODUCTION_ENV_FILE:-$REPO_ROOT/.env.mobile.production}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [ -z "${EXPO_PUBLIC_CONVEX_URL:-}" ] && [ -n "${NEXT_PUBLIC_CONVEX_URL:-}" ]; then
  export EXPO_PUBLIC_CONVEX_URL="$NEXT_PUBLIC_CONVEX_URL"
fi

if [ -z "${EXPO_PUBLIC_WEB_URL:-}" ] && [ -n "${NEXT_PUBLIC_WORKOS_REDIRECT_URI:-}" ]; then
  export EXPO_PUBLIC_WEB_URL="$(node -e "console.log(new URL(process.argv[1]).origin)" "$NEXT_PUBLIC_WORKOS_REDIRECT_URI")"
fi

if [ -z "${EXPO_PUBLIC_CONVEX_URL:-}" ]; then
  echo "❌ EXPO_PUBLIC_CONVEX_URL is not set."
  echo "   Local releases: copy .env.mobile.production.example → .env.mobile.production"
  echo "   EAS cloud: set EXPO_PUBLIC_CONVEX_URL for the production environment on expo.dev."
  exit 1
fi

if ! node -e "const u=new URL(process.env.EXPO_PUBLIC_CONVEX_URL); if(u.protocol!==\"https:\"||!u.hostname.endsWith(\".convex.cloud\")) process.exit(1)" 2>/dev/null; then
  echo "❌ EXPO_PUBLIC_CONVEX_URL must be an https URL with hostname ending in .convex.cloud."
  exit 1
fi

if [ -z "${EXPO_PUBLIC_WEB_URL:-}" ]; then
  echo "❌ EXPO_PUBLIC_WEB_URL is not set."
  echo "   Add NEXT_PUBLIC_WORKOS_REDIRECT_URI (origin becomes EXPO_PUBLIC_WEB_URL) or set EXPO_PUBLIC_WEB_URL directly."
  exit 1
fi

if ! node -e "const u=new URL(process.env.EXPO_PUBLIC_WEB_URL); if(u.protocol!==\"https:\") process.exit(1)" 2>/dev/null; then
  echo "❌ EXPO_PUBLIC_WEB_URL must be an https origin (e.g. https://workout.plutotom.com)."
  exit 1
fi

echo "📎 Release Convex host: $(node -e "console.log(new URL(process.env.EXPO_PUBLIC_CONVEX_URL).hostname)")"
echo "📎 Release web origin: $(node -e "console.log(process.env.EXPO_PUBLIC_WEB_URL)")"
