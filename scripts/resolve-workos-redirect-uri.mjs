#!/usr/bin/env node
/**
 * Resolve NEXT_PUBLIC_WORKOS_REDIRECT_URI for Vercel builds.
 *
 * Production uses authKit.prod.redirectUris from convex.json (custom domain).
 * Preview uses VERCEL_BRANCH_URL so AuthKit keeps one stable callback per
 * branch. VERCEL_URL is a fallback for providers without a branch alias.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveWorkosRedirectUri } from "./deployment-environment.mjs";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(resolve(root, "convex.json"), "utf8"));

try {
  process.stdout.write(resolveWorkosRedirectUri(config));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
