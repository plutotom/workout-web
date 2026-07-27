#!/usr/bin/env node
/**
 * Vercel build entrypoint.
 *
 * Production: deploy Convex, then build Next against the production URL.
 * Staging branch: deploy to the persistent `preview/staging` deployment, then
 * build Next against that exact backend.
 * Other previews: keep using their configured Preview backend without pushing.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  convexDeployArgs,
  isStagingPreview,
  resolveWorkosRedirectUri,
  STAGING_PREVIEW_NAME,
} from "./deployment-environment.mjs";

const root = resolve(import.meta.dirname, "..");
const vercelEnv = process.env.VERCEL_ENV ?? "development";
const config = JSON.parse(readFileSync(resolve(root, "convex.json"), "utf8"));

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

function resolveRedirect() {
  try {
    return resolveWorkosRedirectUri(config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function deployConvexAndBuild({ previewName, skipWorkosCheck } = {}) {
  run("pnpm", convexDeployArgs({ previewName, skipWorkosCheck }), {
    env: { NEXT_PUBLIC_WORKOS_REDIRECT_URI: resolveRedirect() },
  });
}

if (vercelEnv === "preview") {
  if (isStagingPreview()) {
    if (!process.env.CONVEX_DEPLOY_KEY?.trim()) {
      console.error(
        "Staging build requires the preview/staging CONVEX_DEPLOY_KEY scoped to the staging branch.",
      );
      process.exit(1);
    }
    console.log(
      `Staging build: deploying Convex preview/${STAGING_PREVIEW_NAME} without clearing data`,
    );
    deployConvexAndBuild({ skipWorkosCheck: true });
    process.exit(0);
  }

  console.log(
    "Preview build: skipping Convex deploy; using configured NEXT_PUBLIC_CONVEX_URL",
  );
  run("pnpm", ["run", "build:web"], {
    env: { NEXT_PUBLIC_WORKOS_REDIRECT_URI: resolveRedirect() },
  });
  process.exit(0);
}

// Production (and local `pnpm build`): deploy Convex, then build Next.
deployConvexAndBuild();
