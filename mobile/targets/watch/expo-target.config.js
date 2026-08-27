/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "watch",
  name: "Watch",
  displayName: "Workout",
  bundleIdentifier: ".watchkitapp",
  icon: "../../assets/icon.png",
  deploymentTarget: "10.0",
  frameworks: ["SwiftUI", "HealthKit", "WatchConnectivity"],
  entitlements: {
    "com.apple.developer.healthkit": true,
  },
  colors: {
    $accent: "#F3F3F5",
  },
  appleTeamId: config.ios?.appleTeamId,
});
