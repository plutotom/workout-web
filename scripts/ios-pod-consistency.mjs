/** Prebuilt React dynamically links this framework; source pods cannot replace it. */
export function missingPrebuiltReactDependencies(manifest) {
  return (
    /^  - React-Core-prebuilt \(/m.test(manifest) &&
    !/^  - ReactNativeDependencies \(/m.test(manifest)
  );
}
