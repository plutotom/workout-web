#!/usr/bin/env bash
# Bumps the version, updates buildNumber, then runs eas build --local for iOS.
# Loads .env.mobile.production (or env already exported) for production Convex + web URLs.
#
# Usage:
#   ./scripts/build-ios.sh patch    # 1.0.1 → 1.0.2  (bug fixes)
#   ./scripts/build-ios.sh minor    # 1.0.1 → 1.1.0  (new features)
#   ./scripts/build-ios.sh major    # 1.0.1 → 2.0.0  (breaking changes)
#   ./scripts/build-ios.sh          # defaults to patch

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=load-eas-production-env.sh
source "$SCRIPT_DIR/load-eas-production-env.sh"
cd "$MOBILE_ROOT"

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "❌ Invalid bump type: '$BUMP'. Use: patch | minor | major"
  exit 1
fi

APP_JSON="./app.json"
PKG_JSON="./package.json"

CURRENT_VERSION=$(node -e "console.log(require('$APP_JSON').expo.version)")
CURRENT_BUILD=$(node -e "
const json = require('$APP_JSON');
const n = json.expo.ios?.buildNumber;
console.log(n && String(n).trim() ? n : '0');
")

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
NEW_BUILD=$((CURRENT_BUILD + 1))

echo "📱 iOS Build"
echo "   Version:      $CURRENT_VERSION → $NEW_VERSION"
echo "   Build number: $CURRENT_BUILD → $NEW_BUILD"
echo ""
read -r -p "Continue? (y/n) " -n 1
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

node -e "
const fs = require('fs');
const json = JSON.parse(fs.readFileSync('$APP_JSON', 'utf8'));
json.expo.version = '$NEW_VERSION';
json.expo.ios = json.expo.ios || {};
json.expo.ios.buildNumber = '$NEW_BUILD';
fs.writeFileSync('$APP_JSON', JSON.stringify(json, null, 2) + '\n');
"

node -e "
const fs = require('fs');
const json = JSON.parse(fs.readFileSync('$PKG_JSON', 'utf8'));
json.version = '$NEW_VERSION';
fs.writeFileSync('$PKG_JSON', JSON.stringify(json, null, 2) + '\n');
"

echo "✅ Updated app.json and package.json to v$NEW_VERSION (build $NEW_BUILD)"
echo ""

echo "🔨 Starting eas build --local --platform ios --profile production..."
echo "   (This will take a while — go get a coffee ☕)"
echo ""
pnpm exec eas build --local --platform ios --profile production

echo ""
echo "✅ Build complete!"
echo ""
echo "Next step — run the release script to submit + publish OTA:"
echo "   pnpm release:ios:production"
