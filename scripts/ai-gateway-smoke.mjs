#!/usr/bin/env node
/**
 * Live AI Gateway smoke for structured workout drafts.
 *
 * Without AI_GATEWAY_API_KEY: skips (exit 0) unless --require / AI_SMOKE_REQUIRE=1.
 * With key: calls the same generateStructuredObject path production uses and
 * asserts both session + template schemas parse.
 *
 * Usage:
 *   pnpm smoke:ai
 *   pnpm smoke:ai -- --require
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const requireKey =
  process.argv.includes("--require") ||
  process.env.AI_SMOKE_REQUIRE === "1" ||
  process.env.AI_SMOKE_REQUIRE === "true";

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) return {};
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

const fileEnv = loadEnvLocal();
const env = { ...process.env, ...fileEnv };
const apiKey = env.AI_GATEWAY_API_KEY?.trim();

if (!apiKey) {
  const msg =
    "AI Gateway smoke skipped (AI_GATEWAY_API_KEY not set). Add it to .env.local or the agent env, then re-run pnpm smoke:ai.";
  if (requireKey) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`○ ${msg}`);
  process.exit(0);
}

console.log("AI Gateway structured-output smoke\n");

const result = spawnSync(
  "pnpm",
  ["exec", "tsx", "scripts/ai-gateway-smoke-run.ts"],
  {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
