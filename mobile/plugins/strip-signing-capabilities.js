/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins load as CJS */
const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * Local bundle (`*.local`) uses an auto-managed Apple Team provisioning
 * profile that often lacks Push Notifications and Associated Domains.
 *
 * Rest timers only need *local* notifications — those work without
 * `aps-environment`. Universal links are production-only (AASA claims
 * workout.plutotom.com), so Associated Domains is also unnecessary here.
 *
 * Must run after `expo-notifications`, which always writes aps-environment.
 */
function withStripSigningCapabilities(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults["aps-environment"];
    delete config.modResults["com.apple.developer.associated-domains"];
    return config;
  });
}

module.exports = withStripSigningCapabilities;
