#!/usr/bin/env node
/**
 * Sync production: Convex env vars, WorkOS AuthKit redirects, then deploy.
 *
 * Usage:
 *   pnpm sync:prod              # Convex + WorkOS only
 *   pnpm sync:prod -- --vercel  # Also push Convex URL to Vercel and redeploy
 *
 * Requires .env.local with WORKOS_CLIENT_ID, WORKOS_API_KEY, and ideally
 * MCP_API_KEY_PEPPER (falls back to your dev Convex deployment).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const withVercel = process.argv.includes("--vercel");

const CONVEX_ENV_KEYS = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "MCP_API_KEY_PEPPER",
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

function parseConvexUrl(output) {
  const match = output.match(/https:\/\/[a-z0-9-]+\.convex\.cloud/);
  return match?.[0] ?? null;
}

function resolveProdConvexUrl() {
  const dryRun = run("pnpm", ["exec", "convex", "deploy", "--dry-run", "-y"], {
    quiet: true,
  });
  const url = parseConvexUrl(dryRun);
  if (!url) {
    die(
      "Could not resolve production Convex URL — run pnpm exec convex deploy --dry-run",
    );
  }
  return url;
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

function loadProdAuthKitConfig() {
  const config = JSON.parse(readFileSync(resolve(root, "convex.json"), "utf8"));
  const configure = config?.authKit?.prod?.configure;
  if (!configure) {
    die("convex.json is missing authKit.prod.configure");
  }
  return configure;
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

async function workosRequest(apiKey, method, path, body) {
  const response = await fetch(
    `https://api.workos.com/user_management/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );

  const text = await response.text();
  const ok =
    response.ok ||
    response.status === 422 ||
    response.status === 409 ||
    text.includes("already exists") ||
    text.includes("duplicate_cors_origin");

  if (!ok) {
    die(`WorkOS ${method} ${path} failed (${response.status}): ${text}`);
  }
}

async function syncWorkos(apiKey, configure) {
  log("workos", "Syncing AuthKit redirects from convex.json");

  for (const uri of configure.redirectUris ?? []) {
    await workosRequest(apiKey, "POST", "redirect_uris", { uri });
    pass(`redirect ${uri}`);
  }

  if (configure.appHomepageUrl) {
    await workosRequest(apiKey, "PUT", "app_homepage_url", {
      url: configure.appHomepageUrl,
    });
    pass(`homepage ${configure.appHomepageUrl}`);
  }

  for (const origin of configure.corsOrigins ?? []) {
    await workosRequest(apiKey, "POST", "cors_origins", { origin });
    pass(`cors ${origin}`);
  }
}

function syncConvexProdEnv(env, pepper) {
  log("convex", "Setting production environment variables");

  const values = {
    WORKOS_CLIENT_ID: env.WORKOS_CLIENT_ID,
    WORKOS_API_KEY: env.WORKOS_API_KEY,
    MCP_API_KEY_PEPPER: pepper,
  };

  for (const key of CONVEX_ENV_KEYS) {
    const value = values[key];
    if (!value?.trim()) {
      die(`Missing ${key} — set it in .env.local`);
    }
    run("pnpm", ["exec", "convex", "env", "set", key, "--prod"], {
      input: value,
      quiet: true,
    });
    pass(key);
  }
}

function deployConvex() {
  const url = resolveProdConvexUrl();
  log("convex", `Deploying to production (${url})`);
  run("pnpm", ["exec", "convex", "deploy", "-y"], { quiet: true });
  pass(`live at ${url}`);
  return url;
}

function syncVercel(convexUrl) {
  const siteUrl = convexUrl.replace(".convex.cloud", ".convex.site");
  log("vercel", "Updating env vars and redeploying");

  for (const [name, value] of [
    ["NEXT_PUBLIC_CONVEX_URL", convexUrl],
    ["NEXT_PUBLIC_CONVEX_SITE_URL", siteUrl],
  ]) {
    for (const target of ["production", "preview", "development"]) {
      run("pnpm", ["dlx", "vercel", "env", "add", name, target, "--force"], {
        input: value,
        quiet: true,
      });
    }
    pass(`${name} → ${value}`);
  }

  run("pnpm", ["dlx", "vercel", "deploy", "--prod", "--yes"]);
  pass("Vercel production deployment complete");
}

console.log("Sync production");
console.log(withVercel ? "(Convex + WorkOS + Vercel)" : "(Convex + WorkOS)");

const env = loadEnvLocal();
const authKit = loadProdAuthKitConfig();
const pepper = resolveMcpPepper(env);

if (!env.WORKOS_API_KEY?.trim() || !env.WORKOS_CLIENT_ID?.trim()) {
  die("WORKOS_CLIENT_ID and WORKOS_API_KEY are required in .env.local");
}

await syncWorkos(env.WORKOS_API_KEY.trim(), authKit);
syncConvexProdEnv(env, pepper);
const convexUrl = deployConvex();

if (withVercel) {
  if (!convexUrl) {
    die("Cannot update Vercel without a Convex deployment URL");
  }
  syncVercel(convexUrl);
}

console.log("\nDone.");
