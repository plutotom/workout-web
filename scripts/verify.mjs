#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = process.env.VERIFY_BASE_URL ?? "http://localhost:4271";
let failed = false;

const requiredEnv = [
  "NEXT_PUBLIC_CONVEX_URL",
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
];

function pass(message) {
  console.log(`✓ ${message}`);
}

function fail(message) {
  console.error(`✗ ${message}`);
  failed = true;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) {
    return {};
  }

  const values = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index)] = trimmed
      .slice(index + 1)
      .replace(/\s+#.*$/, "")
      .trim();
  }
  return values;
}

console.log("Foundation verify\n");

const env = loadEnvLocal();
for (const key of requiredEnv) {
  if (env[key]?.trim()) {
    pass(`env ${key} is set`);
  } else {
    fail(`env ${key} is missing or empty`);
  }
}

for (const file of [
  "src/proxy.ts",
  "src/app/callback/route.ts",
  "src/app/sign-in/route.ts",
  "backend/auth.config.ts",
  "backend/_generated/api.js",
]) {
  if (existsSync(resolve(root, file))) {
    pass(`file ${file} exists`);
  } else {
    fail(`file ${file} is missing`);
  }
}

const checks = [
  ["lint", ["exec", "eslint", "."]],
  ["format", ["format:check"]],
  ["build", ["build:web"]],
  ["convex sync", ["exec", "convex", "dev", "--once"]],
  ["convex query", ["exec", "convex", "run", "hello:getMessage"]],
];

for (const [label, args] of checks) {
  const result = run("pnpm", args, { env: { ...process.env, ...env } });
  if (result.ok) {
    pass(label);
    if (label === "convex query" && result.stdout) {
      console.log(`  → ${result.stdout}`);
    }
  } else {
    fail(label);
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
  }
}

async function checkHttp(path, expectedStatus, description) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    if (response.status === expectedStatus) {
      pass(description);
      return;
    }
    fail(`${description} (got ${response.status}, expected ${expectedStatus})`);
  } catch (error) {
    fail(`${description} (${error instanceof Error ? error.message : error})`);
  }
}

await checkHttp("/", 200, `GET ${baseUrl}/ returns 200`);
await checkHttp("/sign-in", 307, `GET ${baseUrl}/sign-in redirects to WorkOS`);

const homeHtml = await fetch(`${baseUrl}/`).then((response) => response.text());
if (homeHtml.includes("Hello, world.")) {
  pass("home page renders Hello, world.");
} else {
  fail("home page is missing Hello, world.");
}

if (!failed) {
  console.log("\nAll foundation checks passed.");
} else {
  console.log("\nSome checks failed.");
  process.exit(1);
}
