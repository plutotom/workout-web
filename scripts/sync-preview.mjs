#!/usr/bin/env node
/**
 * Sync preview: Convex preview env defaults, backfill a preview deployment,
 * and push WorkOS secrets to Vercel Preview.
 *
 * Usage:
 *   pnpm sync:preview              # Convex preview defaults + deployment env
 *   pnpm sync:preview -- --vercel  # Also fix empty Vercel Preview env vars
 *
 * Requires .env.local with WORKOS_CLIENT_ID, WORKOS_API_KEY, WORKOS_COOKIE_PASSWORD.
 * MCP_API_KEY_PEPPER falls back to dev Convex (same as sync:prod).
 *
 * For a dedicated preview AuthKit environment, create one in the Convex dashboard
 * (Settings → Integrations → WorkOS) and put those credentials in .env.local first.
 * See https://docs.convex.dev/auth/authkit/auto-provision
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const withVercel = process.argv.includes("--vercel");
const previewDeployment =
  process.env.CONVEX_PREVIEW_DEPLOYMENT?.trim() || "preview/staging";

const CONVEX_ENV_KEYS = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "MCP_API_KEY_PEPPER",
];

const VERCEL_PREVIEW_KEYS = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
];

function log(step, message) {
  console.log(`\n▸ ${step}: ${message}`);
}

function pass(message) {
  console.log(`  ✓ ${message}`);
}

function die(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function run(command, args, { input, quiet } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: quiet ? ["pipe", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    input,
  });
  if (result.status !== 0) {
    const err = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    die(`${command} ${args.join(" ")} failed` + (err ? `\n${err}` : ""));
  }
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) {
    die("Missing .env.local — run pnpm dev once to generate it.");
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

function parseConvexEnvList(stdout) {
  const values = {};
  for (const line of stdout.split("\n")) {
    const index = line.indexOf("=");
    if (index === -1) continue;
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function resolveMcpPepper(env) {
  if (env.MCP_API_KEY_PEPPER?.trim()) {
    return env.MCP_API_KEY_PEPPER.trim();
  }

  log("env", "MCP_API_KEY_PEPPER missing locally — reading from dev Convex");
  const devList = run(
    "pnpm",
    ["exec", "convex", "env", "list", "--deployment", "dev"],
    { quiet: true },
  );
  const pepper = parseConvexEnvList(devList).MCP_API_KEY_PEPPER;
  if (!pepper) {
    die(
      "MCP_API_KEY_PEPPER not in .env.local or dev Convex — add it to .env.local",
    );
  }
  return pepper;
}

function syncConvexPreviewDefaults(values) {
  log("convex", "Setting preview deployment-type defaults");

  for (const key of CONVEX_ENV_KEYS) {
    const value = values[key];
    if (!value?.trim()) {
      die(`Missing ${key}`);
    }
    run(
      "pnpm",
      [
        "exec",
        "convex",
        "env",
        "default",
        "set",
        key,
        "--type",
        "preview",
        "--force",
      ],
      { input: value, quiet: true },
    );
    pass(`default ${key}`);
  }
}

function syncConvexPreviewDeployment(values, deployment) {
  log("convex", `Setting environment variables on ${deployment}`);

  for (const key of CONVEX_ENV_KEYS) {
    const value = values[key];
    run(
      "pnpm",
      ["exec", "convex", "env", "set", key, "--deployment", deployment],
      { input: value, quiet: true },
    );
    pass(`${deployment} ${key}`);
  }
}

function syncVercelPreview(env) {
  log("vercel", "Updating Preview environment variables (WorkOS only)");

  for (const name of VERCEL_PREVIEW_KEYS) {
    const value = env[name];
    if (!value?.trim()) {
      die(`Missing ${name} — set it in .env.local`);
    }
    run("pnpm", ["dlx", "vercel", "env", "add", name, "preview", "--force"], {
      input: value,
      quiet: true,
    });
    pass(`${name} → Preview`);
  }
}

console.log("Sync preview");
console.log(
  withVercel
    ? `(Convex defaults + ${previewDeployment} + Vercel Preview)`
    : `(Convex defaults + ${previewDeployment})`,
);

const env = loadEnvLocal();
const pepper = resolveMcpPepper(env);

if (!env.WORKOS_API_KEY?.trim() || !env.WORKOS_CLIENT_ID?.trim()) {
  die("WORKOS_CLIENT_ID and WORKOS_API_KEY are required in .env.local");
}

const convexValues = {
  WORKOS_CLIENT_ID: env.WORKOS_CLIENT_ID.trim(),
  WORKOS_API_KEY: env.WORKOS_API_KEY.trim(),
  MCP_API_KEY_PEPPER: pepper,
};

syncConvexPreviewDefaults(convexValues);
syncConvexPreviewDeployment(convexValues, previewDeployment);

if (withVercel) {
  syncVercelPreview(env);
}

console.log("\nDone.");
console.log(
  "Redeploy a preview branch on Vercel to verify convex deploy + sign-in.",
);
