import { defineTable } from "convex/server";
import { v } from "convex/values";

export const iosSyncTables = {
  iosSyncReceipts: defineTable({
    userId: v.id("users"),
    operationId: v.string(),
    deviceId: v.string(),
    appliedAt: v.number(),
  }).index("by_user_operation_id", ["userId", "operationId"]),
};
