/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins load as CJS */
const { withPodfile } = require("expo/config-plugins");

/**
 * React Native's pod post_install realpath()s react-native into pnpm's
 * content-addressed store and writes that into Xcode as REACT_NATIVE_PATH.
 * The hash in that folder name changes on `pnpm install`, so Hermes's
 * `[CP-User] Replace Hermes` script 404s on `with-environment.sh`.
 *
 * Keep the workspace symlink (`mobile/node_modules/react-native`) instead.
 * Shell scripts follow it at build time to whatever the current store path is.
 */

const MARKER = "workout-web.stable-react-native-path";

const SNIPPET = `    # ${MARKER}
    require "pathname"
    rn_symlink = File.expand_path("../node_modules/react-native", Pod::Config.instance.installation_root.to_s)
    pods_dir = Pathname.new(Pod::Config.instance.sandbox_root.to_s)
    rn_relative = Pathname.new(rn_symlink).relative_path_from(pods_dir)
    ReactNativePodsUtils.set_build_setting(installer, build_setting: "REACT_NATIVE_PATH", value: File.join("\${PODS_ROOT}", rn_relative.to_s))
`;

function injectStableReactNativePath(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }

  const match = contents.match(/react_native_post_install\([\s\S]*?\n    \)/);
  if (!match || match.index === undefined) {
    throw new Error(
      "Podfile is missing react_native_post_install; cannot pin REACT_NATIVE_PATH for pnpm",
    );
  }

  const insertAt = match.index + match[0].length;
  return `${contents.slice(0, insertAt)}\n${SNIPPET}${contents.slice(insertAt)}`;
}

function withStableReactNativePath(config) {
  return withPodfile(config, (config) => {
    config.modResults.contents = injectStableReactNativePath(
      config.modResults.contents,
    );
    return config;
  });
}

module.exports = withStableReactNativePath;
module.exports.injectStableReactNativePath = injectStableReactNativePath;
module.exports.MARKER = MARKER;
