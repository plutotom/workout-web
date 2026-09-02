import { v } from "convex/values";

import type { Id } from "../../_generated/dataModel";
import { mutation, type MutationCtx } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import { upsertCustomExerciseFromClient } from "../../lib/exercises";
import {
  resolvePushSessionTarget,
  resolveReceiptRemoteSessionId,
} from "../../lib/ios_session_sync";
import { deleteWorkout } from "../../lib/workouts";
import { recordSessionPlaceMemory } from "../../lib/places";
import { muscleGroupValidator } from "../../schemas/exercises";
import {
  sessionKindValidator,
  sessionStatusValidator,
} from "../../schemas/workouts";

const setSnapshotValidator = v.object({
  clientId: v.string(),
  orderIndex: v.number(),
  targetWeight: v.number(),
  targetReps: v.number(),
  weight: v.number(),
  reps: v.number(),
  completed: v.boolean(),
  completedAt: v.union(v.number(), v.null()),
});

const exerciseSnapshotValidator = v.object({
  clientId: v.string(),
  slug: v.string(),
  orderIndex: v.number(),
  restSeconds: v.number(),
  notes: v.union(v.string(), v.null()),
  machineId: v.optional(v.union(v.id("machines"), v.null())),
  machineName: v.optional(v.union(v.string(), v.null())),
  sets: v.array(setSnapshotValidator),
});

const sessionSnapshotValidator = v.object({
  clientId: v.string(),
  remoteTemplateId: v.union(v.id("workoutTemplates"), v.null()),
  templateName: v.string(),
  status: sessionStatusValidator,
  startedAt: v.number(),
  completedAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
  placeId: v.optional(v.union(v.id("places"), v.null())),
  placeName: v.optional(v.union(v.string(), v.null())),
  sessionKind: v.optional(sessionKindValidator),
  countsTowardGoals: v.optional(v.boolean()),
  externalProvider: v.optional(v.union(v.literal("apple_health"), v.null())),
  externalId: v.optional(v.union(v.string(), v.null())),
  activityType: v.optional(v.union(v.string(), v.null())),
  sourceName: v.optional(v.union(v.string(), v.null())),
  sourceBundleId: v.optional(v.union(v.string(), v.null())),
  durationSeconds: v.optional(v.union(v.number(), v.null())),
  energyKcal: v.optional(v.union(v.number(), v.null())),
  distanceMeters: v.optional(v.union(v.number(), v.null())),
  importedAt: v.optional(v.union(v.number(), v.null())),
  exercises: v.array(exerciseSnapshotValidator),
});

const resultValidator = v.object({
  status: v.union(
    v.literal("applied"),
    v.literal("duplicate"),
    v.literal("stale"),
  ),
  remoteSessionId: v.union(v.id("workoutSessions"), v.null()),
  serverTime: v.number(),
});

const MAX_EXERCISES = 50;
const MAX_SETS_PER_EXERCISE = 20;

async function findSessionsForPush(
  ctx: MutationCtx,
  userId: Id<"users">,
  session: {
    clientId: string;
    externalProvider?: "apple_health" | null;
    externalId?: string | null;
  },
) {
  const existingByClient = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_client_id", (q) =>
      q.eq("userId", userId).eq("clientId", session.clientId),
    )
    .first();
  const externalProvider = session.externalProvider;
  const externalId = session.externalId;
  const externalMatches =
    externalProvider && externalId
      ? await ctx.db
          .query("workoutSessions")
          .withIndex("by_user_external", (q) =>
            q
              .eq("userId", userId)
              .eq("externalProvider", externalProvider)
              .eq("externalId", externalId),
          )
          .take(8)
      : [];
  const existingByExternal =
    externalMatches.find((row) => row._id !== existingByClient?._id) ??
    externalMatches[0] ??
    null;
  return { existingByClient, existingByExternal };
}

/**
 * Upload one custom exercise authored offline. The phone references it locally
 * by a provisional `custom:local-…` slug; the returned slug is the durable one
 * and the device rewrites its rows to match before pushing templates/sessions.
 */
export const pushCustomExercise = mutation({
  args: {
    operationId: v.string(),
    deviceId: v.string(),
    exercise: v.object({
      clientId: v.string(),
      name: v.string(),
      short: v.union(v.string(), v.null()),
      category: muscleGroupValidator,
      usesBar: v.boolean(),
      archived: v.boolean(),
    }),
  },
  returns: v.object({
    remoteExerciseId: v.id("customExercises"),
    slug: v.string(),
    serverTime: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // The upsert is keyed by clientId, so a replayed operation is already
    // idempotent; the receipt still records the attempt for auditing.
    const result = await upsertCustomExerciseFromClient(ctx, user._id, {
      clientId: args.exercise.clientId,
      name: args.exercise.name,
      short: args.exercise.short ?? undefined,
      category: args.exercise.category,
      usesBar: args.exercise.usesBar,
      archived: args.exercise.archived,
    });

    const duplicate = await ctx.db
      .query("iosSyncReceipts")
      .withIndex("by_user_operation_id", (q) =>
        q.eq("userId", user._id).eq("operationId", args.operationId),
      )
      .first();
    if (!duplicate) {
      await ctx.db.insert("iosSyncReceipts", {
        userId: user._id,
        operationId: args.operationId,
        deviceId: args.deviceId,
        appliedAt: Date.now(),
      });
    }

    return {
      remoteExerciseId: result.id,
      slug: result.slug,
      serverTime: Date.now(),
    };
  },
});

/**
 * Upload the latest aggregate for one locally-owned session. The operation ID
 * makes retries safe when a device loses its response after Convex commits.
 */
export const pushSession = mutation({
  args: {
    operationId: v.string(),
    deviceId: v.string(),
    session: sessionSnapshotValidator,
  },
  returns: resultValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const duplicate = await ctx.db
      .query("iosSyncReceipts")
      .withIndex("by_user_operation_id", (q) =>
        q.eq("userId", user._id).eq("operationId", args.operationId),
      )
      .first();
    if (duplicate) {
      const { existingByClient, existingByExternal } =
        await findSessionsForPush(ctx, user._id, args.session);
      return {
        status: "duplicate" as const,
        remoteSessionId: resolveReceiptRemoteSessionId({
          existingByClient,
          existingByExternal,
        }),
        serverTime: Date.now(),
      };
    }

    if (args.session.exercises.length > MAX_EXERCISES) {
      throw new Error(
        `A session can contain at most ${MAX_EXERCISES} exercises`,
      );
    }
    if (
      args.session.exercises.some(
        (exercise) => exercise.sets.length > MAX_SETS_PER_EXERCISE,
      )
    ) {
      throw new Error(
        `An exercise can contain at most ${MAX_SETS_PER_EXERCISE} sets`,
      );
    }

    const { existingByClient, existingByExternal } = await findSessionsForPush(
      ctx,
      user._id,
      args.session,
    );
    const resolution = resolvePushSessionTarget({
      existingByClient,
      existingByExternal,
      incomingKind: args.session.sessionKind,
    });
    if (resolution.action === "skip") {
      // Same Health UUID already belongs to a linked detailed workout. Keep
      // that row and ack so the phone can store the remote id.
      await ctx.db.insert("iosSyncReceipts", {
        userId: user._id,
        operationId: args.operationId,
        deviceId: args.deviceId,
        appliedAt: Date.now(),
      });
      return {
        status: "duplicate" as const,
        remoteSessionId: resolution.targetId,
        serverTime: Date.now(),
      };
    }
    const existing =
      resolution.action === "apply"
        ? existingByClient?._id === resolution.targetId
          ? existingByClient
          : existingByExternal
        : null;
    if (
      existing?.clientUpdatedAt !== undefined &&
      existing.clientUpdatedAt > args.session.updatedAt &&
      !(resolution.action === "apply" && resolution.ignoreStale)
    ) {
      return {
        status: "stale" as const,
        remoteSessionId: existing._id,
        serverTime: Date.now(),
      };
    }
    if (resolution.action === "apply") {
      if (resolution.deleteSessionId) {
        await deleteWorkout(ctx, user._id, resolution.deleteSessionId);
      }
      if (resolution.unlinkSessionId) {
        await ctx.db.patch(resolution.unlinkSessionId, {
          externalProvider: undefined,
          externalId: undefined,
        });
      }
    }

    const sessionFields = {
      clientId: args.session.clientId,
      clientUpdatedAt: args.session.updatedAt,
      templateName: args.session.templateName,
      status: args.session.status,
      startedAt: args.session.startedAt,
      completedAt: args.session.completedAt ?? undefined,
      templateId: args.session.remoteTemplateId ?? undefined,
      sessionKind: args.session.sessionKind ?? "tracked",
      countsTowardGoals: args.session.countsTowardGoals ?? true,
      externalProvider: args.session.externalProvider ?? undefined,
      externalId: args.session.externalId ?? undefined,
      activityType: args.session.activityType ?? undefined,
      sourceName: args.session.sourceName ?? undefined,
      sourceBundleId: args.session.sourceBundleId ?? undefined,
      durationSeconds: args.session.durationSeconds ?? undefined,
      energyKcal: args.session.energyKcal ?? undefined,
      distanceMeters: args.session.distanceMeters ?? undefined,
      importedAt: args.session.importedAt ?? undefined,
      placeId: args.session.placeId ?? undefined,
      placeName: args.session.placeName ?? undefined,
    };
    const sessionId =
      existing?._id ??
      (await ctx.db.insert("workoutSessions", {
        userId: user._id,
        ...sessionFields,
      }));
    if (existing) await ctx.db.patch(existing._id, sessionFields);

    const existingExercises = await ctx.db
      .query("sessionExercises")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .take(MAX_EXERCISES);
    const incomingExerciseIds = new Set(
      args.session.exercises.map((exercise) => exercise.clientId),
    );

    for (const exercise of args.session.exercises) {
      const existingExercise = existingExercises.find(
        (candidate) => candidate.clientId === exercise.clientId,
      );
      const exerciseFields = {
        clientId: exercise.clientId,
        exerciseSlug: exercise.slug,
        orderIndex: exercise.orderIndex,
        restSeconds: exercise.restSeconds,
        notes: exercise.notes ?? undefined,
        machineId: exercise.machineId ?? undefined,
        machineName: exercise.machineName ?? undefined,
      };
      const exerciseId = existingExercise
        ? existingExercise._id
        : await ctx.db.insert("sessionExercises", {
            sessionId,
            ...exerciseFields,
          });
      if (existingExercise)
        await ctx.db.patch(existingExercise._id, exerciseFields);

      const existingSets = await ctx.db
        .query("sets")
        .withIndex("by_session_exercise", (q) =>
          q.eq("sessionExerciseId", exerciseId),
        )
        .take(MAX_SETS_PER_EXERCISE);
      const incomingSetIds = new Set(exercise.sets.map((set) => set.clientId));
      for (const set of exercise.sets) {
        const existingSet = existingSets.find(
          (candidate) => candidate.clientId === set.clientId,
        );
        const setFields = {
          clientId: set.clientId,
          orderIndex: set.orderIndex,
          targetWeight: set.targetWeight,
          targetReps: set.targetReps,
          weight: set.weight,
          reps: set.reps,
          completed: set.completed,
          completedAt: set.completedAt ?? undefined,
        };
        if (existingSet) await ctx.db.patch(existingSet._id, setFields);
        else {
          await ctx.db.insert("sets", {
            sessionExerciseId: exerciseId,
            ...setFields,
          });
        }
      }
      for (const set of existingSets) {
        if (set.clientId && !incomingSetIds.has(set.clientId)) {
          await ctx.db.delete(set._id);
        }
      }
    }

    for (const exercise of existingExercises) {
      if (exercise.clientId && !incomingExerciseIds.has(exercise.clientId)) {
        const sets = await ctx.db
          .query("sets")
          .withIndex("by_session_exercise", (q) =>
            q.eq("sessionExerciseId", exercise._id),
          )
          .take(MAX_SETS_PER_EXERCISE);
        for (const set of sets) await ctx.db.delete(set._id);
        await ctx.db.delete(exercise._id);
      }
    }

    if (args.session.status === "completed") {
      await recordSessionPlaceMemory(ctx, user._id, sessionId);
    }

    await ctx.db.insert("iosSyncReceipts", {
      userId: user._id,
      operationId: args.operationId,
      deviceId: args.deviceId,
      appliedAt: Date.now(),
    });
    return {
      status: "applied" as const,
      remoteSessionId: sessionId,
      serverTime: Date.now(),
    };
  },
});

const deleteSnapshotValidator = v.object({
  clientId: v.string(),
  remoteId: v.union(v.string(), v.null()),
  externalProvider: v.union(v.literal("apple_health"), v.null()),
  externalId: v.union(v.string(), v.null()),
});

/**
 * Idempotent delete for a locally-owned session. Never touches Apple Health.
 */
export const deleteSession = mutation({
  args: {
    operationId: v.string(),
    deviceId: v.string(),
    session: deleteSnapshotValidator,
  },
  returns: v.object({
    status: v.union(v.literal("applied"), v.literal("duplicate")),
    serverTime: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const duplicate = await ctx.db
      .query("iosSyncReceipts")
      .withIndex("by_user_operation_id", (q) =>
        q.eq("userId", user._id).eq("operationId", args.operationId),
      )
      .first();
    if (duplicate) {
      return { status: "duplicate" as const, serverTime: Date.now() };
    }

    let existing = await ctx.db
      .query("workoutSessions")
      .withIndex("by_user_client_id", (q) =>
        q.eq("userId", user._id).eq("clientId", args.session.clientId),
      )
      .first();
    if (!existing && args.session.remoteId) {
      const remoteId = ctx.db.normalizeId(
        "workoutSessions",
        args.session.remoteId,
      );
      if (remoteId) {
        const byRemote = await ctx.db.get(remoteId);
        if (byRemote && byRemote.userId === user._id) existing = byRemote;
      }
    }
    const deleteProvider = args.session.externalProvider;
    const deleteExternalId = args.session.externalId;
    if (!existing && deleteProvider && deleteExternalId) {
      existing = await ctx.db
        .query("workoutSessions")
        .withIndex("by_user_external", (q) =>
          q
            .eq("userId", user._id)
            .eq("externalProvider", deleteProvider)
            .eq("externalId", deleteExternalId),
        )
        .first();
    }

    if (existing) await deleteWorkout(ctx, user._id, existing._id);

    await ctx.db.insert("iosSyncReceipts", {
      userId: user._id,
      operationId: args.operationId,
      deviceId: args.deviceId,
      appliedAt: Date.now(),
    });
    return { status: "applied" as const, serverTime: Date.now() };
  },
});
