import { defineTable } from "convex/server";
import { v } from "convex/values";

export const syncAggregateTypeValidator = v.union(
  v.literal("workout"),
  v.literal("template"),
  v.literal("exercise"),
  v.literal("place"),
  v.literal("machine"),
  v.literal("settings"),
);

function defineSyncedDocTable() {
  return defineTable({
    id: v.string(),
    ownerId: v.string(),
    version: v.number(),
    seq: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    doc: v.any(),
  })
    .index("by_owner_id", ["ownerId", "id"])
    .index("by_owner_seq", ["ownerId", "seq"]);
}

export const nativeSyncTables = {
  nativeWorkouts: defineSyncedDocTable(),
  nativeTemplates: defineSyncedDocTable(),
  nativeExercises: defineSyncedDocTable(),
  nativePlaces: defineSyncedDocTable(),
  nativeMachines: defineSyncedDocTable(),
  nativeSettings: defineSyncedDocTable(),

  appliedOps: defineTable({
    opId: v.string(),
    ownerId: v.string(),
    aggregateType: syncAggregateTypeValidator,
    aggregateId: v.string(),
    version: v.number(),
    seq: v.number(),
    appliedAt: v.number(),
  }).index("by_owner_opId", ["ownerId", "opId"]),

  userSeq: defineTable({
    ownerId: v.string(),
    seq: v.number(),
  }).index("by_owner", ["ownerId"]),
};
