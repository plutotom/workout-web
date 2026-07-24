import { v } from "convex/values";

import { mutation, query } from "../../_generated/server";
import { requireUser, getUser } from "../../lib/auth";
import {
  apiKeyDisplayPrefix,
  generateRawApiKey,
  hashApiKey,
  requireUserFromApiKey,
} from "../../lib/apiKeys";
import { consumeRateLimit } from "../../lib/rateLimits";

const MAX_API_KEYS_PER_USER = 10;
const MAX_API_KEY_NAME_LENGTH = 64;
const MCP_REQUEST_POLICY = {
  minuteLimit: 120,
  dayLimit: 5_000,
  errorCode: "MCP_RATE_LIMITED",
} as const;

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);
    const normalizedName = name.trim() || "API key";
    if (normalizedName.length > MAX_API_KEY_NAME_LENGTH) {
      throw new Error(
        `API key name must be at most ${MAX_API_KEY_NAME_LENGTH} characters`,
      );
    }

    const existing = await ctx.db
      .query("mcpApiKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MAX_API_KEYS_PER_USER);
    if (existing.length >= MAX_API_KEYS_PER_USER) {
      throw new Error(`At most ${MAX_API_KEYS_PER_USER} API keys are allowed`);
    }

    const rawKey = generateRawApiKey();
    const keyHash = await hashApiKey(rawKey);

    await ctx.db.insert("mcpApiKeys", {
      userId: user._id,
      keyHash,
      keyPrefix: apiKeyDisplayPrefix(rawKey),
      name: normalizedName,
      createdAt: Date.now(),
    });

    return { rawKey, keyPrefix: apiKeyDisplayPrefix(rawKey) };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const keys = await ctx.db
      .query("mcpApiKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    keys.sort((a, b) => b.createdAt - a.createdAt);
    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    }));
  },
});

export const revoke = mutation({
  args: { keyId: v.id("mcpApiKeys") },
  handler: async (ctx, { keyId }) => {
    const user = await requireUser(ctx);
    const record = await ctx.db.get(keyId);
    if (!record || record.userId !== user._id) throw new Error("Key not found");
    await ctx.db.delete(keyId);
  },
});

/** Authenticate and rate-limit one MCP HTTP request. */
export const authorize = mutation({
  args: { apiKey: v.string() },
  returns: v.object({
    userId: v.id("users"),
    email: v.string(),
  }),
  handler: async (ctx, { apiKey }) => {
    const user = await requireUserFromApiKey(ctx, apiKey);
    if (user.emailVerifiedAt === undefined) {
      throw new Error("Verified user email is required");
    }
    await consumeRateLimit(ctx, `mcp:${user._id}`, MCP_REQUEST_POLICY);
    return { userId: user._id, email: user.email };
  },
});
