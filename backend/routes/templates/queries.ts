import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";
import {
  getTemplate as getTemplateLib,
  listTemplates,
} from "../../lib/templates";

/** User's templates (newest-edited first) with their ordered exercises and last completed-session time. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    return listTemplates(ctx, user._id);
  },
});

/** A single template with its ordered exercises, for the editor. Null if missing/not owned. */
export const get = query({
  args: { templateId: v.id("workoutTemplates") },
  handler: async (ctx, { templateId }) => {
    const user = await getUser(ctx);
    if (!user) return null;
    return getTemplateLib(ctx, user._id, templateId);
  },
});
