/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins load as CJS */
const fs = require("fs");
const {
  IOSConfig,
  withEntitlementsPlist,
  withFinalizedMod,
} = require("expo/config-plugins");

/**
 * Local / Personal Team builds cannot use paid Apple capabilities.
 *
 * `expo-notifications` always writes `aps-environment` (Push). Rest timers only
 * need *local* notifications — those work without it. Associated Domains are
 * production-only (AASA claims workout.plutotom.com).
 *
 * Entitlements mods from other plugins can re-add keys after a normal
 * `withEntitlementsPlist` pass, so we also rewrite the file in a finalized mod.
 */
const EMPTY_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict/>
</plist>
`;

const PAID_ENTITLEMENT_KEYS = [
  "aps-environment",
  "com.apple.developer.associated-domains",
];

function stripPaidEntitlements(entitlements) {
  for (const key of PAID_ENTITLEMENT_KEYS) {
    delete entitlements[key];
  }
  return entitlements;
}

function withStripSigningCapabilities(config) {
  config = withEntitlementsPlist(config, (config) => {
    config.modResults = stripPaidEntitlements(config.modResults);
    return config;
  });

  return withFinalizedMod(config, [
    "ios",
    async (config) => {
      const entitlementsPath = IOSConfig.Entitlements.getEntitlementsPath(
        config.modRequest.projectRoot,
      );
      if (entitlementsPath && fs.existsSync(entitlementsPath)) {
        fs.writeFileSync(entitlementsPath, EMPTY_ENTITLEMENTS);
      }
      return config;
    },
  ]);
}

module.exports = withStripSigningCapabilities;
