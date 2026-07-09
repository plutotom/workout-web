#!/usr/bin/env node
/**
 * Vercel build entrypoint.
 *
 * Production: deploy Convex, then build Next with the prod WorkOS redirect URI.
 * Preview: skip Convex deploy for now (preview deploy key path is unreliable)
 * and build Next against Preview env (including NEXT_PUBLIC_CONVEX_URL).
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const vercelEnv = process.env.VERCEL_ENV ?? "development";

function run(command, args, { env } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (vercelEnv === "preview") {
  console.log(
    "Preview build: skipping convex deploy; using existing NEXT_PUBLIC_CONVEX_URL",
  );
  const redirect = spawnSync(
    process.execPath,
    [resolve(root, "scripts/resolve-workos-redirect-uri.mjs")],
    { cwd: root, encoding: "utf8" },
  );
  if (redirect.status !== 0) {
    process.stderr.write(redirect.stderr || redirect.stdout || "");
    process.exit(redirect.status ?? 1);
  }
  run("pnpm", ["run", "build:web"], {
    env: { NEXT_PUBLIC_WORKOS_REDIRECT_URI: redirect.stdout.trim() },
  });
  process.exit(0);
}

// Production (and local `pnpm build`): deploy Convex, then build Next.
run("pnpm", [
  "exec",
  "convex",
  "deploy",
  "--cmd",
  'sh -c "NEXT_PUBLIC_WORKOS_REDIRECT_URI=$(node scripts/resolve-workos-redirect-uri.mjs) pnpm run build:web"',
]);
