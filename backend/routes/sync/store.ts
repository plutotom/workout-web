import { v } from "convex/values";

import { internalMutation, internalQuery } from "../../_generated/server";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { syncAggregateTypeValidator } from "../../schemas/nativeSync";
import {
  applyPushBatch,
  collectPullChanges,
  type SyncAggregateType,
  type SyncAppliedOpRecord,
  type SyncPullStore,
  type SyncPushOp,
  type SyncPushStore,
  type SyncStoredDoc,
} from "./core";

type NativeTableName =
  | "nativeWorkouts"
  | "nativeTemplates"
  | "nativeExercises"
  | "nativePlaces"
  | "nativeMachines"
  | "nativeSettings";

function tableNameFor(aggregateType: SyncAggregateType): NativeTableName {
  switch (aggregateType) {
    case "workout":
      return "nativeWorkouts";
    case "template":
      return "nativeTemplates";
    case "exercise":
      return "nativeExercises";
    case "place":
      return "nativePlaces";
    case "machine":
      return "nativeMachines";
    case "settings":
      return "nativeSettings";
  }
}

function makePushStore(ctx: MutationCtx): SyncPushStore {
  return {
    async getAppliedOp(
      ownerId: string,
      opId: string,
    ): Promise<SyncAppliedOpRecord | null> {
      const existing = await ctx.db
        .query("appliedOps")
        .withIndex("by_owner_opId", (q) =>
          q.eq("ownerId", ownerId).eq("opId", opId),
        )
        .unique();
      if (!existing) return null;
      return {
        opId: existing.opId,
        ownerId: existing.ownerId,
        aggregateType: existing.aggregateType,
        aggregateId: existing.aggregateId,
        version: existing.version,
        seq: existing.seq,
        appliedAt: existing.appliedAt,
      };
    },

    async recordAppliedOp(record: SyncAppliedOpRecord): Promise<void> {
      await ctx.db.insert("appliedOps", record);
    },

    async getDoc(
      ownerId: string,
      aggregateType: SyncAggregateType,
      aggregateId: string,
    ): Promise<SyncStoredDoc | null> {
      const table = tableNameFor(aggregateType);
      const row = await ctx.db
        .query(table)
        .withIndex("by_owner_id", (q) =>
          q.eq("ownerId", ownerId).eq("id", aggregateId),
        )
        .unique();
      if (!row) return null;
      return {
        id: row.id,
        ownerId: row.ownerId,
        version: row.version,
        seq: row.seq,
        updatedAt: row.updatedAt,
        ...(row.deletedAt !== undefined ? { deletedAt: row.deletedAt } : {}),
        doc: row.doc,
      };
    },

    async upsertDoc(
      aggregateType: SyncAggregateType,
      doc: SyncStoredDoc,
    ): Promise<void> {
      const table = tableNameFor(aggregateType);
      const existing = await ctx.db
        .query(table)
        .withIndex("by_owner_id", (q) =>
          q.eq("ownerId", doc.ownerId).eq("id", doc.id),
        )
        .unique();
      const payload = {
        id: doc.id,
        ownerId: doc.ownerId,
        version: doc.version,
        seq: doc.seq,
        updatedAt: doc.updatedAt,
        ...(doc.deletedAt !== undefined ? { deletedAt: doc.deletedAt } : {}),
        doc: doc.doc,
      };
      if (existing) {
        await ctx.db.replace(existing._id, payload);
      } else {
        await ctx.db.insert(table, payload);
      }
    },

    async nextSeq(ownerId: string): Promise<number> {
      const current = await ctx.db
        .query("userSeq")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .unique();
      if (current) {
        const next = current.seq + 1;
        await ctx.db.patch(current._id, { seq: next });
        return next;
      }
      await ctx.db.insert("userSeq", { ownerId, seq: 1 });
      return 1;
    },
  };
}

function makePullStore(ctx: QueryCtx): SyncPullStore {
  return {
    async listDocsAfterSeq(
      ownerId: string,
      aggregateType: SyncAggregateType,
      cursor: number,
      limit: number,
    ): Promise<SyncStoredDoc[]> {
      const table = tableNameFor(aggregateType);
      const rows = await ctx.db
        .query(table)
        .withIndex("by_owner_seq", (q) =>
          q.eq("ownerId", ownerId).gt("seq", cursor),
        )
        .order("asc")
        .take(limit);

      return rows.map((row) => ({
        id: row.id,
        ownerId: row.ownerId,
        version: row.version,
        seq: row.seq,
        updatedAt: row.updatedAt,
        ...(row.deletedAt !== undefined ? { deletedAt: row.deletedAt } : {}),
        doc: row.doc,
      }));
    },
  };
}

export const resolveOwnerId = internalQuery({
  args: {
    email: v.optional(v.string()),
    fallbackId: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email?.trim().toLowerCase();
    if (normalizedEmail) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .first();
      if (user) {
        return user._id;
      }
    }
    return args.fallbackId;
  },
});

export const applyPush = internalMutation({
  args: {
    ownerId: v.string(),
    ops: v.array(
      v.object({
        opId: v.string(),
        aggregateType: syncAggregateTypeValidator,
        aggregateId: v.string(),
        baseVersion: v.number(),
        updatedAt: v.number(),
        deletedAt: v.optional(v.number()),
        doc: v.any(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ops: SyncPushOp[] = args.ops.map((op) => ({
      opId: op.opId,
      aggregateType: op.aggregateType,
      aggregateId: op.aggregateId,
      baseVersion: op.baseVersion,
      updatedAt: op.updatedAt,
      ...(op.deletedAt !== undefined ? { deletedAt: op.deletedAt } : {}),
      doc: op.doc,
    }));
    return await applyPushBatch(
      makePushStore(ctx),
      args.ownerId,
      ops,
      Date.now(),
    );
  },
});

export const readPull = internalQuery({
  args: {
    ownerId: v.string(),
    cursor: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await collectPullChanges(
      makePullStore(ctx),
      args.ownerId,
      args.cursor,
      args.limit,
    );
  },
});
