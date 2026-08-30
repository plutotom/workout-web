#!/usr/bin/env bash
# Deploy Convex production, then publish an EAS Update to the production channel.
#
# Usage:
#   ./scripts/publish-ota-production.sh              # default message
#   ./scripts/publish-ota-production.sh "fix sync"  # custom message
#
# JS-only OTA (no backend changes):
#   SKIP_CONVEX_DEPLOY=1 ./scripts/publish-ota-production.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=load-eas-production-env.sh
source "$SCRIPT_DIR/load-eas-production-env.sh"

cd "$MOBILE_ROOT"

VERSION=$(node -e "console.log(require('./app.json').expo.version)")
MSG="${1:-OTA v$VERSION ($(date -u +%Y-%m-%dT%H:%MZ))}"

echo "🔄 Publishing OTA for runtime version $VERSION (channel: production)"
echo ""

if [ "${SKIP_CONVEX_DEPLOY:-}" = "1" ]; then
  echo "⏭️  SKIP_CONVEX_DEPLOY=1 — skipping Convex production deploy."
  echo ""
else
  echo "📡 Step 1/2: Convex production deploy..."
  (cd "$REPO_ROOT" && pnpm exec convex deploy --yes)
  echo ""
fi

echo "📤 Step 2/2: eas update → production channel..."
pnpm exec eas update --channel production --environment production --message "$MSG"
echo ""
echo "✅ OTA published."
echo "⚠️  Users may need to open the app twice for the update to apply."
