import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";
import {
  findStarredPlace,
  latestCompletedSession,
  listActivePlaces,
  listMachinesForLift,
  serializeMachine,
  serializePlace,
} from "../../lib/places";
import { exerciseSlugValidator } from "../../schemas/exercises";

const placeReturn = v.object({
  _id: v.id("places"),
  name: v.string(),
  starred: v.boolean(),
  lastUsedAt: v.union(v.number(), v.null()),
});

const machineReturn = v.object({
  _id: v.id("machines"),
  placeId: v.id("places"),
  exerciseSlug: v.string(),
  name: v.string(),
  isDefault: v.boolean(),
  lastUsedAt: v.union(v.number(), v.null()),
});

export const list = query({
  args: {},
  returns: v.array(placeReturn),
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const places = await listActivePlaces(ctx, user._id);
    return places.map(serializePlace);
  },
});

/**
 * Place chip on Start: available places plus which one to preselect.
 * `templateId` omitted for quick start.
 */
export const startContext = query({
  args: { templateId: v.optional(v.id("workoutTemplates")) },
  returns: v.union(
    v.null(),
    v.object({
      places: v.array(placeReturn),
      selectedPlaceId: v.union(v.id("places"), v.null()),
      lastPlaceId: v.union(v.id("places"), v.null()),
      lastPlaceName: v.union(v.string(), v.null()),
      starredPlaceId: v.union(v.id("places"), v.null()),
    }),
  ),
  handler: async (ctx, { templateId }) => {
    const user = await getUser(ctx);
    if (!user) return null;
    const places = (await listActivePlaces(ctx, user._id)).map(serializePlace);
    const starred = await findStarredPlace(ctx, user._id);
    let lastPlaceId: (typeof places)[number]["_id"] | null = null;
    let lastPlaceName: string | null = null;

    if (templateId) {
      const template = await ctx.db.get(templateId);
      if (template && template.userId === user._id && template.lastPlaceId) {
        const last = await ctx.db.get(template.lastPlaceId);
        if (last && last.userId === user._id && !last.archived) {
          lastPlaceId = last._id;
          lastPlaceName = last.name;
        }
      }
    } else {
      const lastSession = await latestCompletedSession(ctx, user._id);
      if (lastSession?.placeId) {
        const last = await ctx.db.get(lastSession.placeId);
        if (last && last.userId === user._id && !last.archived) {
          lastPlaceId = last._id;
          lastPlaceName = last.name;
        }
      }
    }

    const selectedPlaceId =
      lastPlaceId ?? starred?._id ?? places[0]?._id ?? null;

    return {
      places,
      selectedPlaceId,
      lastPlaceId,
      lastPlaceName,
      starredPlaceId: starred?._id ?? null,
    };
  },
});

export const machinesForLift = query({
  args: {
    placeId: v.id("places"),
    exerciseSlug: exerciseSlugValidator,
  },
  returns: v.array(machineReturn),
  handler: async (ctx, { placeId, exerciseSlug }) => {
    const user = await getUser(ctx);
    if (!user) return [];
    try {
      const machines = await listMachinesForLift(
        ctx,
        user._id,
        placeId,
        exerciseSlug,
      );
      return machines.map(serializeMachine);
    } catch {
      return [];
    }
  },
});
