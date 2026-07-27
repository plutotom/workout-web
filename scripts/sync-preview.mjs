#!/usr/bin/env node
/**
 * Sync the persistent staging environment: Convex preview defaults, the
 * preview/staging deployment, WorkOS redirects, and staging-branch Vercel
 * secrets.
 *
 * Usage:
 *   pnpm sync:preview              # Convex preview defaults + deployment env
 *   pnpm sync:preview -- --vercel  # Also sync staging-only Vercel env vars
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

import { DEFAULT_STAGING_ORIGIN } from "./deployment-environment.mjs";

const root = resolve(import.meta.dirname, "..");
const withVercel = process.argv.includes("--vercel");
const previewDeployment =
  process.env.CONVEX_PREVIEW_DEPLOYMENT?.trim() || "preview/staging";
const stagingBranch = process.env.STAGING_GIT_BRANCH?.trim() || "staging";
const vercelProject =
  process.env.VERCEL_PROJECT_NAME?.trim() || "workout-web-staging";
const stagingOrigin =
  process.env.STAGING_APP_URL?.trim().replace(/\/$/, "") ||
  DEFAULT_STAGING_ORIGIN;

const CONVEX_ENV_KEYS = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "MCP_API_KEY_PEPPER",
];

const VERCEL_STAGING_REQUIRED_KEYS = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
];

const VERCEL_STAGING_OPTIONAL_KEYS = ["AI_GATEWAY_API_KEY", "AI_GATEWAY_MODEL"];

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
    let value = trimmed
      .slice(index + 1)
      .replace(/\s+#.*$/, "")
      .trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[trimmed.slice(0, index)] = value.replace(/\\n/g, "\n");
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

  const responseText = await response.text();
  const ok =
    response.ok ||
    response.status === 422 ||
    response.status === 409 ||
    responseText.includes("already exists") ||
    responseText.includes("duplicate_cors_origin");
  if (!ok) {
    die(
      `WorkOS ${method} ${path} failed (${response.status}): ${responseText}`,
    );
  }
}

async function syncWorkosStaging(apiKey) {
  log("workos", `Configuring AuthKit for ${stagingOrigin}`);
  await workosRequest(apiKey, "POST", "redirect_uris", {
    uri: `${stagingOrigin}/callback`,
  });
  pass(`redirect ${stagingOrigin}/callback`);
  await workosRequest(apiKey, "PUT", "app_homepage_url", {
    url: stagingOrigin,
  });
  pass(`homepage ${stagingOrigin}`);
  await workosRequest(apiKey, "POST", "cors_origins", {
    origin: stagingOrigin,
  });
  pass(`cors ${stagingOrigin}`);
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

function syncVercelStaging(env) {
  log(
    "vercel",
    `Updating Preview variables for the ${stagingBranch} branch only`,
  );

  for (const name of VERCEL_STAGING_REQUIRED_KEYS) {
    const value = env[name];
    if (!value?.trim()) {
      die(`Missing ${name} — set it in .env.local`);
    }
    run(
      "pnpm",
      [
        "dlx",
        "vercel",
        "env",
        "add",
        name,
        "preview",
        stagingBranch,
        "--project",
        vercelProject,
        "--force",
        "--yes",
        "--sensitive",
      ],
      { input: value, quiet: true },
    );
    pass(`${name} → Preview/${stagingBranch}`);
  }

  for (const name of VERCEL_STAGING_OPTIONAL_KEYS) {
    const value = env[name]?.trim();
    if (!value) continue;
    run(
      "pnpm",
      [
        "dlx",
        "vercel",
        "env",
        "add",
        name,
        "preview",
        stagingBranch,
        "--project",
        vercelProject,
        "--force",
        "--yes",
        "--sensitive",
      ],
      { input: value, quiet: true },
    );
    pass(`${name} → Preview/${stagingBranch}`);
  }
}

console.log("Sync preview");
console.log(
  withVercel
    ? `(Convex defaults + ${previewDeployment} + Vercel Preview/${stagingBranch})`
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

await syncWorkosStaging(env.WORKOS_API_KEY.trim());
syncConvexPreviewDefaults(convexValues);
syncConvexPreviewDeployment(convexValues, previewDeployment);

if (withVercel) {
  syncVercelStaging(env);
}

console.log("\nDone.");
console.log(
  `Push ${stagingBranch} to verify persistent Convex deploy + WorkOS sign-in.`,
);
