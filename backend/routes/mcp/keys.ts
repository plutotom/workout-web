import { v } from "convex/values";

import { mutation, query } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import {
  apiKeyDisplayPrefix,
  generateRawApiKey,
  hashApiKey,
} from "../../lib/apiKeys";

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);
    const rawKey = generateRawApiKey();
    const keyHash = await hashApiKey(rawKey);

    await ctx.db.insert("mcpApiKeys", {
      userId: user._id,
      keyHash,
      keyPrefix: apiKeyDisplayPrefix(rawKey),
      name: name.trim() || "API key",
      createdAt: Date.now(),
    });

    return { rawKey, keyPrefix: apiKeyDisplayPrefix(rawKey) };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
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
