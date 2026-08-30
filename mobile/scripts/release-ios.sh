#!/usr/bin/env bash
# Run this AFTER: eas build --local (see build-ios.sh)
# Deploys Convex production, submits the .ipa to Apple, publishes the matching OTA bundle.
#
# Usage:
#   ./scripts/release-ios.sh                        # auto-finds the .ipa in mobile/
#   ./scripts/release-ios.sh path/to/build.ipa     # use a specific .ipa
#
# Skip Convex deploy (e.g. backend unchanged since last OTA):
#   SKIP_CONVEX_DEPLOY=1 ./scripts/release-ios.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=load-eas-production-env.sh
source "$SCRIPT_DIR/load-eas-production-env.sh"
cd "$MOBILE_ROOT"

VERSION=$(node -e "console.log(require('./app.json').expo.version)")

echo "🚀 Releasing iOS v$VERSION"
echo ""

IPA_PATH="${1:-}"

if [ -z "$IPA_PATH" ]; then
  for f in ./*.ipa; do
    [ -e "$f" ] || continue
    if [ -z "$IPA_PATH" ] || [ "$f" -nt "$IPA_PATH" ]; then
      IPA_PATH="$f"
    fi
  done
fi

if [ -z "$IPA_PATH" ]; then
  echo "❌ No .ipa file found. Either:"
  echo "   1. Run 'pnpm build:ios:production' first to produce a .ipa"
  echo "   2. Pass the path as an argument: ./scripts/release-ios.sh path/to/build.ipa"
  exit 1
fi

echo "📦 Found build: $IPA_PATH"
echo ""

if [ "${SKIP_CONVEX_DEPLOY:-}" = "1" ]; then
  echo "⏭️  SKIP_CONVEX_DEPLOY=1 — skipping Convex production deploy."
  echo ""
else
  echo "📡 Step 1/3: Convex production deploy..."
  (cd "$REPO_ROOT" && pnpm exec convex deploy --yes)
  echo ""
fi

echo "📤 Step 2/3: Submitting to Apple..."
pnpm exec eas submit --platform ios --path "$IPA_PATH"
echo ""

echo "🔄 Step 3/3: Publishing OTA update for runtime version $VERSION..."
pnpm exec eas update --channel production --environment production --message "v$VERSION release"
echo ""

echo "✅ Done!"
echo "   Native build submitted to TestFlight/App Store"
echo "   OTA bundle published for runtime version $VERSION"
echo ""
echo "⚠️  Remember: users may need to open the app twice for the OTA update to apply."
