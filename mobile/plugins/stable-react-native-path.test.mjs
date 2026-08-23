import { describe, expect, it } from "vitest";

import {
  MARKER,
  injectStableReactNativePath,
} from "./stable-react-native-path.js";

const generatedPodfile = `# Set by expo-router. This enables Fabric-only features from react-native-screens
ENV['RNS_GAMMA_ENABLED'] ||= '1'
require File.join(File.dirname(\`node --print "require.resolve('expo/package.json')"\`), "scripts/autolinking")
require File.join(File.dirname(\`node --print "require.resolve('react-native/package.json')"\`), "scripts/react_native_pods")

target 'Workout' do
  use_react_native!(
    :path => config[:reactNativePath],
  )

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end
`;

describe("injectStableReactNativePath", () => {
  it("pins REACT_NATIVE_PATH to the workspace symlink after RN post_install", () => {
    const next = injectStableReactNativePath(generatedPodfile);
    expect(next).toContain(MARKER);
    expect(next).toContain("../node_modules/react-native");
    expect(next.indexOf("react_native_post_install(")).toBeLessThan(
      next.indexOf(MARKER),
    );
  });

  it("is idempotent", () => {
    const once = injectStableReactNativePath(generatedPodfile);
    expect(injectStableReactNativePath(once)).toBe(once);
  });

  it("throws when the generated post_install hook is missing", () => {
    expect(() => injectStableReactNativePath("platform :ios, '16.4'")).toThrow(
      /react_native_post_install/,
    );
  });
});
