/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins load as CJS */
const fs = require("fs");
const {
  IOSConfig,
  withEntitlementsPlist,
  withFinalizedMod,
  withXcodeProject,
} = require("expo/config-plugins");
const plistModule = require("@expo/plist");
const plist = plistModule.parse ? plistModule : plistModule.default;

/**
 * Local / Personal Team builds cannot use paid Apple capabilities.
 *
 * `expo-notifications` always writes `aps-environment` (Push). Rest timers only
 * need *local* notifications — those work without it. Associated Domains are
 * production-only (AASA claims workout.plutotom.com).
 *
 * HealthKit is a free capability and must survive prebuild: the HealthKit
 * config plugin writes its keys, then later plugins can re-add paid keys.
 * Strip only the unsupported local capabilities instead of emptying the file.
 *
 * `appleTeamId` in app.json writes DEVELOPMENT_TEAM during prebuild. Expo then
 * treats signing as "already configured" and skips CODE_SIGN_STYLE=Automatic
 * plus `-allowProvisioningUpdates`. Device installs need both so Xcode can
 * mint a free Personal Team profile — no paid provisioning required.
 */

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

function quoteTeamId(teamId) {
  return `"${String(teamId).replace(/["']/g, "")}"`;
}

function enableAutomaticSigning(project, appleTeamId) {
  const quotedAppleTeamId = quoteTeamId(appleTeamId);
  const targets = IOSConfig.Target.findSignableTargets(project);

  for (const [nativeTargetId, nativeTarget] of targets) {
    IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      project,
      nativeTarget.buildConfigurationList,
    )
      .filter(
        ([, item]) => item.buildSettings && item.buildSettings.PRODUCT_NAME,
      )
      .forEach(([, item]) => {
        item.buildSettings.DEVELOPMENT_TEAM = quotedAppleTeamId;
        item.buildSettings.CODE_SIGN_IDENTITY = '"Apple Development"';
        item.buildSettings.CODE_SIGN_STYLE = "Automatic";
      });

    Object.entries(IOSConfig.XcodeUtils.getProjectSection(project))
      .filter(IOSConfig.XcodeUtils.isNotComment)
      .forEach(([, item]) => {
        if (!item.attributes) return;
        if (!item.attributes.TargetAttributes) {
          item.attributes.TargetAttributes = {};
        }
        if (!item.attributes.TargetAttributes[nativeTargetId]) {
          item.attributes.TargetAttributes[nativeTargetId] = {};
        }
        item.attributes.TargetAttributes[nativeTargetId].DevelopmentTeam =
          quotedAppleTeamId;
        item.attributes.TargetAttributes[nativeTargetId].ProvisioningStyle =
          "Automatic";
      });
  }

  return project;
}

function withStripSigningCapabilities(config) {
  config = withEntitlementsPlist(config, (config) => {
    config.modResults = stripPaidEntitlements(config.modResults);
    return config;
  });

  const appleTeamId = config.ios?.appleTeamId;
  if (appleTeamId) {
    config = withXcodeProject(config, (config) => {
      config.modResults = enableAutomaticSigning(
        config.modResults,
        appleTeamId,
      );
      return config;
    });
  }

  return withFinalizedMod(config, [
    "ios",
    async (config) => {
      const entitlementsPath = IOSConfig.Entitlements.getEntitlementsPath(
        config.modRequest.projectRoot,
      );
      if (entitlementsPath && fs.existsSync(entitlementsPath)) {
        const parsed = plist.parse(fs.readFileSync(entitlementsPath, "utf8"));
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          Object.keys(parsed).length === 0
        ) {
          // Prebuild has not flushed entitlements yet. Rewriting an empty
          // dict here wipes HealthKit keys written later in the same run.
          return config;
        }
        const stripped = stripPaidEntitlements(parsed);
        fs.writeFileSync(entitlementsPath, plist.build(stripped));
      }
      return config;
    },
  ]);
}

module.exports = withStripSigningCapabilities;
module.exports.enableAutomaticSigning = enableAutomaticSigning;
module.exports.stripPaidEntitlements = stripPaidEntitlements;
