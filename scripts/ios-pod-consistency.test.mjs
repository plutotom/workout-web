import { expect, it } from "vitest";
import { missingPrebuiltReactDependencies } from "./ios-pod-consistency.mjs";

it("detects the launch-crashing mix of prebuilt React and source dependencies", () => {
  expect(
    missingPrebuiltReactDependencies(
      "PODS:\n  - React-Core-prebuilt (0.86.3):\n    - glog\n  - glog (0.3.5)\n",
    ),
  ).toBe(true);
  expect(
    missingPrebuiltReactDependencies(
      "PODS:\n  - React-Core-prebuilt (0.86.3):\n    - ReactNativeDependencies\n  - ReactNativeDependencies (0.86.3)\n",
    ),
  ).toBe(false);
  expect(
    missingPrebuiltReactDependencies(
      "PODS:\n  - React-Core (0.86.3)\n  - glog (0.3.5)\n",
    ),
  ).toBe(false);
});
