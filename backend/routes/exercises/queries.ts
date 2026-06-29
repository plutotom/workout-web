import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";
import { getNotesBySlugs } from "../../lib/exercise_notes";
import { listCustomExercises } from "../../lib/exercises";
import { exerciseSlugValidator } from "../../schemas/exercises";

/** The signed-in user's custom exercises (includes archived for name resolution). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    return listCustomExercises(ctx, user._id);
  },
});

/** Notes for the given exercise slugs (empty object when signed out). */
export const getNotes = query({
  args: { slugs: v.array(exerciseSlugValidator) },
  handler: async (ctx, { slugs }) => {
    const user = await getUser(ctx);
    if (!user) return {};
    return getNotesBySlugs(ctx, user._id, slugs);
  },
});
