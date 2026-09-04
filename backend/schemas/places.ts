import { defineTable } from "convex/server";
import { v } from "convex/values";

import { exerciseSlugValidator } from "./exercises";

export const placeTables = {
  // Gyms / rooms the user trains in. At most one is starred as the default.
  places: defineTable({
    userId: v.id("users"),
    name: v.string(),
    starred: v.boolean(),
    archived: v.boolean(),
    lastUsedAt: v.optional(v.number()),
    // Lets an offline phone create a place and later merge with Convex.
    clientId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_client_id", ["userId", "clientId"]),

  // Named stations for one lift at one place ("Corner" vs "Usual").
  machines: defineTable({
    userId: v.id("users"),
    placeId: v.id("places"),
    exerciseSlug: exerciseSlugValidator,
    name: v.string(),
    // Successor of the implicit unnamed machine at this lift.
    isDefault: v.boolean(),
    archived: v.boolean(),
    lastUsedAt: v.optional(v.number()),
    clientId: v.optional(v.string()),
  })
    .index("by_place_slug", ["placeId", "exerciseSlug"])
    .index("by_user", ["userId"])
    .index("by_user_client_id", ["userId", "clientId"]),

  // Last logged set prescription at (place, lift, machine).
  // machineKey is "default" until the user names a second machine.
  exercisePlaceWeights: defineTable({
    userId: v.id("users"),
    placeId: v.id("places"),
    exerciseSlug: exerciseSlugValidator,
    machineKey: v.string(),
    sets: v.array(v.object({ weight: v.number(), reps: v.number() })),
    updatedAt: v.number(),
  }).index("by_place_slug_machine", ["placeId", "exerciseSlug", "machineKey"]),
};
