import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const KEY_PREFIX = "waw_";

function getPepper(): string {
  const pepper = process.env.MCP_API_KEY_PEPPER;
  if (!pepper) throw new Error("MCP_API_KEY_PEPPER is not configured");
  return pepper;
}

/** SHA-256 hex digest of pepper + raw key. */
export async function hashApiKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(getPepper() + rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isApiKeyFormat(rawKey: string): boolean {
  return (
    rawKey.startsWith(KEY_PREFIX) && rawKey.length > KEY_PREFIX.length + 16
  );
}

/** Generate a new raw API key (shown once to the user). */
export function generateRawApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${KEY_PREFIX}${encoded}`;
}

export function apiKeyDisplayPrefix(rawKey: string): string {
  return rawKey.slice(0, 12);
}

/** Resolve the user for a valid API key, updating last-used time. */
export async function requireUserFromApiKey(
  ctx: MutationCtx,
  rawKey: string,
): Promise<Doc<"users">> {
  if (!isApiKeyFormat(rawKey)) throw new Error("Invalid API key");

  const keyHash = await hashApiKey(rawKey);
  const record = await ctx.db
    .query("mcpApiKeys")
    .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
    .unique();
  if (!record) throw new Error("Invalid API key");

  // Throttle writes to reduce OCC conflicts when concurrent mutations share the same key.
  // On a Convex OCC retry the timestamp will already be fresh and the write is skipped.
  const now = Date.now();
  if (!record.lastUsedAt || now - record.lastUsedAt > 5 * 60_000) {
    await ctx.db.patch(record._id, { lastUsedAt: now });
  }

  const user = await ctx.db.get(record.userId);
  if (!user) throw new Error("Invalid API key");
  return user;
}

/** Read-only lookup for actions that cannot write lastUsedAt in a query context. */
export async function getUserFromApiKey(
  ctx: QueryCtx,
  rawKey: string,
): Promise<Doc<"users"> | null> {
  if (!isApiKeyFormat(rawKey)) return null;

  const keyHash = await hashApiKey(rawKey);
  const record = await ctx.db
    .query("mcpApiKeys")
    .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
    .unique();
  if (!record) return null;

  return (await ctx.db.get(record.userId)) ?? null;
}
