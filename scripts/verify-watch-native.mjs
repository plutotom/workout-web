import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "darwin") {
  throw new Error(
    "Native Watch verification requires macOS and Xcode; use the Watch native lifecycle CI job.",
  );
}
const root = resolve(import.meta.dirname, "..");
const architecture = process.arch === "arm64" ? "arm64" : "x86_64";
const sdk = (name) =>
  execFileSync("xcrun", ["--sdk", name, "--show-sdk-path"], {
    encoding: "utf8",
  }).trim();
const check = (sdkName, target, sources) =>
  execFileSync(
    "xcrun",
    [
      "swiftc",
      "-typecheck",
      "-sdk",
      sdk(sdkName),
      "-target",
      target,
      ...sources,
    ],
    { stdio: "inherit", timeout: 60_000 },
  );

const watchRoot = join(root, "mobile/targets/watch");
check(
  "watchsimulator",
  `${architecture}-apple-watchos10.0-simulator`,
  readdirSync(watchRoot)
    .filter((file) => file.endsWith(".swift"))
    .map((file) => join(watchRoot, file)),
);

// Typecheck the actual phone transport against Apple's SDK. Only the Expo DSL's
// exception constructor is replaced; pod registration is checked by a full app build.
const directory = mkdtempSync(join(tmpdir(), "workout-watch-phone-types-"));
try {
  const source = readFileSync(
    join(root, "mobile/modules/watch-bridge/ios/WatchBridgeModule.swift"),
    "utf8",
  );
  const start = source.indexOf("final class WatchPhoneSession:");
  if (start < 0) throw new Error("Watch phone transport source not found");
  const transport = join(directory, "WatchPhoneSession.swift");
  writeFileSync(
    transport,
    `import Foundation\nimport HealthKit\nimport WatchConnectivity\nfinal class Exception: Error { init(name: String, description: String) {} }\n${source.slice(start)}`,
  );
  check("iphonesimulator", `${architecture}-apple-ios16.4-simulator`, [
    transport,
    join(
      root,
      "mobile/modules/watch-bridge/ios/WatchSessionSnapshotCache.swift",
    ),
  ]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
console.log(
  "Watch app and iPhone Watch transport passed Apple SDK typechecking.",
);
