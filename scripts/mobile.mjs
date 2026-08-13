import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_ENV_FILE = ".env.local";

function resolveEnvFilePath() {
  const configured = process.env.MOBILE_ENV_FILE?.trim();
  const relative = configured || DEFAULT_ENV_FILE;
  return path.isAbsolute(relative) ? relative : path.join(root, relative);
}

function readAllowedEnvironment(envFilePath) {
  if (!existsSync(envFilePath)) {
    const hint = envFilePath.endsWith(".env.mobile.preview")
      ? " Copy .env.mobile.preview.example to .env.mobile.preview and set preview URLs."
      : "";
    throw new Error(`Mobile env file not found: ${envFilePath}.${hint}`);
  }

  const source = readFileSync(envFilePath, "utf8");
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (
      key !== "NEXT_PUBLIC_CONVEX_URL" &&
      key !== "NEXT_PUBLIC_WORKOS_REDIRECT_URI"
    ) {
      continue;
    }
    values[key] = raw.replace(/^['"]|['"]$/g, "");
  }
  const convexUrl = values.NEXT_PUBLIC_CONVEX_URL;
  const redirectUri = values.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  if (!convexUrl || !redirectUri) {
    throw new Error(
      `${envFilePath} must contain NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_WORKOS_REDIRECT_URI.`,
    );
  }
  return {
    EXPO_PUBLIC_CONVEX_URL: convexUrl,
    EXPO_PUBLIC_WEB_URL: new URL(redirectUri).origin,
  };
}

const envFilePath = resolveEnvFilePath();
const mobileEnvironment = readAllowedEnvironment(envFilePath);
const envLabel = path.relative(root, envFilePath) || path.basename(envFilePath);
console.log(
  `[mobile] Using ${envLabel} → EXPO_PUBLIC_WEB_URL=${mobileEnvironment.EXPO_PUBLIC_WEB_URL}`,
);

function wantsPhysicalDevice(extra) {
  return extra.some(
    (arg) => arg === "--device" || arg === "-d" || arg.startsWith("--device="),
  );
}

function childEnv(extra) {
  const env = { ...process.env, ...mobileEnvironment };
  if (!wantsPhysicalDevice(extra)) {
    return env;
  }
  // Expo will not pass -allowProvisioningUpdates when appleTeamId already
  // wrote DEVELOPMENT_TEAM. Prepend a shim so xcodebuild can mint a free
  // Personal Team profile for the connected phone.
  const shimDir = path.join(root, "scripts", "ios-signing-shim");
  env.PATH = `${shimDir}${path.delimiter}${env.PATH ?? ""}`;
  console.log(
    "[mobile] Device build: automatic signing updates enabled (Personal Team, no paid profile)",
  );
  return env;
}

const command = process.argv[2] ?? "start";
const extra = process.argv.slice(3);
const child = spawn("pnpm", ["--dir", "mobile", command, ...extra], {
  cwd: root,
  env: childEnv(extra),
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
