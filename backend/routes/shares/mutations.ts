import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import { importBundle } from "../../lib/portableTemplates";
import {
  createShare,
  getLiveShare,
  revokeShare as revokeShareLib,
} from "../../lib/shares";
import { portableBundleValidator } from "../../schemas/portable";

/**
 * Mint a share link for a bundle. The bundle is snapshotted, so the link keeps
 * serving what was sent even if the sender later edits or deletes the template.
 */
export const create = mutation({
  args: {
    bundle: portableBundleValidator,
    sharedBy: v.optional(v.string()),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createShare(ctx, user._id, args);
  },
});

export const revoke = mutation({
  args: { shareId: v.id("templateShares") },
  handler: async (ctx, { shareId }) => {
    const user = await requireUser(ctx);
    await revokeShareLib(ctx, user._id, shareId);
  },
});

/**
 * Import a share link's templates into the caller's account. Requires sign-in
 * (unlike the preview) — we need somewhere to put the templates.
 */
export const importFromToken = mutation({
  args: { token: v.string(), includeNotes: v.optional(v.boolean()) },
  handler: async (ctx, { token, includeNotes }) => {
    const user = await requireUser(ctx);

    const share = await getLiveShare(ctx, token);
    if (!share) throw new Error("This share link is no longer available");

    const result = await importBundle(ctx, user._id, share.bundle, {
      includeNotes,
    });
    await ctx.db.patch(share._id, { importCount: share.importCount + 1 });
    return result;
  },
});
