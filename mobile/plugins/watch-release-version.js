/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins load as CJS */
const fs = require("fs");
const { IOSConfig, withFinalizedMod } = require("expo/config-plugins");

// apple-targets preserves an existing target's old build number. App Store
// validation requires the embedded Watch app to match its containing iPhone app.
module.exports = function withWatchReleaseVersion(config) {
  return withFinalizedMod(config, [
    "ios",
    async (mod) => {
      const project = IOSConfig.XcodeUtils.getPbxproj(
        mod.modRequest.projectRoot,
      );
      for (const [, target] of IOSConfig.Target.findSignableTargets(project)) {
        for (const [
          ,
          configuration,
        ] of IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
          project,
          target.buildConfigurationList,
        )) {
          if (!configuration.buildSettings) continue;
          configuration.buildSettings.CURRENT_PROJECT_VERSION = String(
            config.ios?.buildNumber ?? "1",
          );
          configuration.buildSettings.MARKETING_VERSION =
            config.version ?? "1.0.0";
        }
      }
      fs.writeFileSync(project.filepath, project.writeSync());
      return mod;
    },
  ]);
};
