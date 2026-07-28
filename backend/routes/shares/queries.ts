import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";
import { getLiveShare, listShares } from "../../lib/shares";

/**
 * Public preview for a share link — **deliberately unauthenticated**, because
 * the recipient may not have an account yet and needs to see what they were
 * sent before signing up. The token is the only credential; unknown, revoked,
 * and expired tokens are indistinguishable (all return null).
 *
 * Only the bundle and the sender's chosen label are exposed — never the
 * sender's user id, email, or anything else about their account.
 */
export const preview = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const share = await getLiveShare(ctx, token);
    if (!share) return null;
    return {
      sharedBy: share.sharedBy,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      bundle: share.bundle,
    };
  },
});

/** The caller's live share links, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    return listShares(ctx, user._id);
  },
});
