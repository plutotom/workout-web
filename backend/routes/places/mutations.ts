import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import {
  archiveMachine as archiveMachineLib,
  archivePlace,
  assignMachineToExercise,
  createMachineAtPlace,
  createNamedMachine,
  createPlace,
  renameMachine as renameMachineLib,
  renamePlace,
  reseedSessionToPlace,
  starPlace,
} from "../../lib/places";
import { exerciseSlugValidator } from "../../schemas/exercises";

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("places"),
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);
    return createPlace(ctx, user._id, name);
  },
});

export const rename = mutation({
  args: { placeId: v.id("places"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { placeId, name }) => {
    const user = await requireUser(ctx);
    await renamePlace(ctx, user._id, placeId, name);
    return null;
  },
});

export const star = mutation({
  args: { placeId: v.id("places") },
  returns: v.null(),
  handler: async (ctx, { placeId }) => {
    const user = await requireUser(ctx);
    await starPlace(ctx, user._id, placeId);
    return null;
  },
});

export const archive = mutation({
  args: { placeId: v.id("places") },
  returns: v.null(),
  handler: async (ctx, { placeId }) => {
    const user = await requireUser(ctx);
    await archivePlace(ctx, user._id, placeId);
    return null;
  },
});

export const setSessionPlace = mutation({
  args: {
    sessionId: v.id("workoutSessions"),
    placeId: v.id("places"),
  },
  returns: v.object({
    hadCompletedSets: v.boolean(),
    reseeded: v.number(),
  }),
  handler: async (ctx, { sessionId, placeId }) => {
    const user = await requireUser(ctx);
    return reseedSessionToPlace(ctx, user._id, sessionId, placeId);
  },
});

export const setSessionMachine = mutation({
  args: {
    sessionExerciseId: v.id("sessionExercises"),
    machineId: v.id("machines"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assignMachineToExercise(
      ctx,
      user._id,
      args.sessionExerciseId,
      args.machineId,
    );
    return null;
  },
});

export const createMachine = mutation({
  args: {
    sessionExerciseId: v.id("sessionExercises"),
    name: v.string(),
  },
  returns: v.id("machines"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createNamedMachine(ctx, user._id, args);
  },
});

/** Create a named machine without a Convex session — iOS local workouts. */
export const createMachineForLift = mutation({
  args: {
    placeId: v.id("places"),
    exerciseSlug: exerciseSlugValidator,
    name: v.string(),
  },
  returns: v.id("machines"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createMachineAtPlace(ctx, user._id, args);
  },
});

export const renameMachine = mutation({
  args: { machineId: v.id("machines"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { machineId, name }) => {
    const user = await requireUser(ctx);
    await renameMachineLib(ctx, user._id, machineId, name);
    return null;
  },
});

export const archiveMachine = mutation({
  args: { machineId: v.id("machines") },
  returns: v.null(),
  handler: async (ctx, { machineId }) => {
    const user = await requireUser(ctx);
    await archiveMachineLib(ctx, user._id, machineId);
    return null;
  },
});
