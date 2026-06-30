#!/usr/bin/env node
/**
 * Resolve NEXT_PUBLIC_WORKOS_REDIRECT_URI for Vercel builds.
 *
 * Production uses authKit.prod.redirectUris from convex.json (custom domain).
 * Preview uses VERCEL_URL (unique per deployment).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(resolve(root, "convex.json"), "utf8"));

function die(message) {
  console.error(message);
  process.exit(1);
}

const vercelEnv = process.env.VERCEL_ENV ?? "development";

if (vercelEnv === "production") {
  const uri = config.authKit?.prod?.configure?.redirectUris?.[0];
  if (!uri) {
    die("convex.json is missing authKit.prod.configure.redirectUris[0]");
  }
  process.stdout.write(uri);
} else if (vercelEnv === "preview") {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (!vercelUrl) {
    die("VERCEL_URL is required for preview builds");
  }
  process.stdout.write(`https://${vercelUrl}/callback`);
} else {
  const uri =
    config.authKit?.dev?.localEnvVars?.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??
    "http://localhost:4271/callback";
  process.stdout.write(uri);
}
