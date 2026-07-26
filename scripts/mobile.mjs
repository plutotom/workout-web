import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readAllowedEnvironment() {
  const source = readFileSync(path.join(root, ".env.local"), "utf8");
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
      "The worktree .env.local must contain NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_WORKOS_REDIRECT_URI.",
    );
  }
  return {
    EXPO_PUBLIC_CONVEX_URL: convexUrl,
    EXPO_PUBLIC_WEB_URL: new URL(redirectUri).origin,
  };
}

const mobileEnvironment = readAllowedEnvironment();

const command = process.argv[2] ?? "start";
const extra = process.argv.slice(3);
const child = spawn("pnpm", ["--dir", "mobile", command, ...extra], {
  cwd: root,
  env: { ...process.env, ...mobileEnvironment },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
