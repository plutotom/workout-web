import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { computeWeekStreak, estimate1RM, startOfWeekMonday } from "./insights";
import { getNotesBySlugs } from "./exercise_notes";
import { normalizeSessionKind } from "./health_sessions";
import {
  exerciseMatchesMachine,
  findStarredPlace,
  getWorkingSets,
  lastMachineForLift,
  listMachinesForLift,
  recordSessionPlaceMemory,
  resolvePlaceForStart,
  seedExerciseSets,
  sessionMatchesPlace,
} from "./places";

const clampWhole = (n: number) => Math.max(0, Math.round(n));
const DEFAULT_REST_SECONDS = 75;
const MAX_EXERCISES_PER_SESSION = 50;
const MAX_SETS_PER_EXERCISE = 20;
const MAX_WEIGHT = 10_000;
const MAX_REPS = 1_000;
const MAX_SLUG_LENGTH = 64;

function boundedWhole(value: number, max: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${field} must be between 0 and ${max}`);
  }
  return clampWhole(value);
}

function normalizeExerciseSlug(slug: string) {
  const normalized = slug.trim();
  if (!normalized || normalized.length > MAX_SLUG_LENGTH) {
    throw new Error(
      `Exercise slug must be between 1 and ${MAX_SLUG_LENGTH} characters`,
    );
  }
  return normalized;
}

/**
 * The most recent completed set (weight > 0) for an exercise. When placeId is
 * set, only sessions at that place (legacy untagged sessions count as Home).
 * machineId further scopes to a named station; the default machine also
 * matches older rows with no machine.
 */
export async function lastSetForExercise(
  ctx: QueryCtx,
  userId: Id<"users">,
  slug: Doc<"sessionExercises">["exerciseSlug"],
  scope?: {
    placeId?: Id<"places"> | null;
    machineId?: Id<"machines"> | null;
  },
): Promise<{
  weight: number;
  reps: number;
  placeName: string | null;
  machineName: string | null;
} | null> {
  const home = await findStarredPlace(ctx, userId);
  const placeId = scope?.placeId ?? home?._id ?? null;
  let defaultMachineId: Id<"machines"> | null = null;
  if (placeId) {
    const machines = await listMachinesForLift(ctx, userId, placeId, slug);
    defaultMachineId =
      machines.find((machine) => machine.isDefault)?._id ?? null;
  }

  const completed = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();
  completed.sort(
    (a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
  );

  for (const session of completed) {
    if (placeId && !sessionMatchesPlace(session, placeId, home?._id ?? null)) {
      continue;
    }
    const exercises = await ctx.db
      .query("sessionExercises")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const match = exercises.find((e) => e.exerciseSlug === slug);
    if (!match) continue;
    if (!exerciseMatchesMachine(match, scope?.machineId, defaultMachineId)) {
      continue;
    }

    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", match._id),
      )
      .collect();
    const done = sets
      .filter((s) => s.completed && s.weight > 0)
      .sort((a, b) => b.orderIndex - a.orderIndex);
    if (done.length) {
      return {
        weight: done[0].weight,
        reps: done[0].reps,
        placeName: session.placeName ?? home?.name ?? null,
        machineName: match.machineName ?? null,
      };
    }
  }
  return null;
}

async function ownedSession(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId)
    throw new Error("Session not found");
  return session;
}

async function ownedSetContext(
  ctx: MutationCtx,
  userId: Id<"users">,
  setId: Id<"sets">,
) {
  const set = await ctx.db.get(setId);
  if (!set) throw new Error("Set not found");
  const sessionExercise = await ctx.db.get(set.sessionExerciseId);
  if (!sessionExercise) throw new Error("Set not found");
  await ownedSession(ctx, userId, sessionExercise.sessionId);
  return set;
}

async function abandonActiveIfNeeded(
  ctx: MutationCtx,
  userId: Id<"users">,
  abandonExisting?: boolean,
) {
  const active = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "in_progress"),
    )
    .first();
  if (active) {
    if (!abandonExisting) throw new Error("ACTIVE_SESSION_EXISTS");
    await ctx.db.patch(active._id, { status: "abandoned" });
  }
}

export async function startWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    templateId,
    placeId,
    abandonExisting,
  }: {
    templateId: Id<"workoutTemplates">;
    placeId?: Id<"places">;
    abandonExisting?: boolean;
  },
) {
  const template = await ctx.db.get(templateId);
  if (!template || template.userId !== userId)
    throw new Error("Template not found");

  await abandonActiveIfNeeded(ctx, userId, abandonExisting);

  const place = await resolvePlaceForStart(ctx, userId, {
    placeId,
    templateId,
  });

  const templateExercises = await ctx.db
    .query("templateExercises")
    .withIndex("by_template", (q) => q.eq("templateId", templateId))
    .collect();
  templateExercises.sort((a, b) => a.orderIndex - b.orderIndex);

  const sessionId = await ctx.db.insert("workoutSessions", {
    userId,
    templateId,
    templateName: template.name,
    status: "in_progress",
    startedAt: Date.now(),
    placeId: place._id,
    placeName: place.name,
  });

  for (const te of templateExercises) {
    const machine = await lastMachineForLift(
      ctx,
      userId,
      place._id,
      te.exerciseSlug,
    );
    const memory = await getWorkingSets(ctx, {
      placeId: place._id,
      exerciseSlug: te.exerciseSlug,
      machineId: machine?._id,
    });
    const seeded = seedExerciseSets(te.sets, memory);
    const sessionExerciseId = await ctx.db.insert("sessionExercises", {
      sessionId,
      exerciseSlug: te.exerciseSlug,
      orderIndex: te.orderIndex,
      restSeconds: DEFAULT_REST_SECONDS,
      machineId: machine?._id,
      machineName: machine?.name,
    });
    for (let i = 0; i < seeded.length; i++) {
      const preset = seeded[i]!;
      await ctx.db.insert("sets", {
        sessionExerciseId,
        orderIndex: i,
        targetWeight: preset.weight,
        targetReps: preset.reps,
        weight: preset.weight,
        reps: preset.reps,
        completed: false,
      });
    }
  }

  return sessionId;
}

/** Start an empty session with no template — user adds exercises as they go. */
export async function startBlankWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    abandonExisting,
    placeId,
  }: { abandonExisting?: boolean; placeId?: Id<"places"> } = {},
) {
  await abandonActiveIfNeeded(ctx, userId, abandonExisting);
  const place = await resolvePlaceForStart(ctx, userId, { placeId });

  return await ctx.db.insert("workoutSessions", {
    userId,
    status: "in_progress",
    startedAt: Date.now(),
    placeId: place._id,
    placeName: place.name,
  });
}

function sessionDisplayName(
  template: Doc<"workoutTemplates"> | null | undefined,
  snapshotName?: string | null,
) {
  const name = template?.name ?? snapshotName?.trim();
  return name && name.length > 0 ? name : "Quick start";
}

/** A set counts as logged work if it was checked off with at least one rep
 * (weight may be 0 for bodyweight lifts). */
export function isLoggedSet(set: {
  completed: boolean;
  reps: number;
}): boolean {
  return set.completed && set.reps > 0;
}

async function sessionHasLoggedWork(
  ctx: MutationCtx | QueryCtx,
  sessionId: Id<"workoutSessions">,
): Promise<boolean> {
  const exercises = await sessionExercisesFor(ctx, sessionId);
  for (const exercise of exercises) {
    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", exercise._id),
      )
      .collect();
    if (sets.some(isLoggedSet)) return true;
  }
  return false;
}

export async function updateSet(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    setId,
    weight,
    reps,
    completed,
  }: {
    setId: Id<"sets">;
    weight?: number;
    reps?: number;
    completed?: boolean;
  },
) {
  const set = await ownedSetContext(ctx, userId, setId);
  const sessionExercise = await ctx.db.get(set.sessionExerciseId);
  if (!sessionExercise) throw new Error("Set not found");
  await assertSessionEditable(ctx, userId, sessionExercise.sessionId);

  const patch: Partial<Doc<"sets">> = {};
  if (weight !== undefined) {
    patch.weight = boundedWhole(weight, MAX_WEIGHT, "Weight");
  }
  if (reps !== undefined) {
    patch.reps = boundedWhole(reps, MAX_REPS, "Reps");
  }
  if (completed !== undefined) {
    patch.completed = completed;
    patch.completedAt = completed ? Date.now() : undefined;
  }
  await ctx.db.patch(setId, patch);
}

const DEFAULT_SET_ROWS = 3;

async function sessionExercisesFor(
  ctx: MutationCtx | QueryCtx,
  sessionId: Id<"workoutSessions">,
) {
  const exercises = await ctx.db
    .query("sessionExercises")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
  exercises.sort((a, b) => a.orderIndex - b.orderIndex);
  return exercises;
}

async function assertSessionEditable(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ownedSession(ctx, userId, sessionId);
  if (session.status !== "in_progress")
    throw new Error("Workout is no longer active");
  return session;
}

export async function addSet(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionExerciseId: Id<"sessionExercises">,
) {
  const sessionExercise = await ctx.db.get(sessionExerciseId);
  if (!sessionExercise) throw new Error("Exercise not found");
  await assertSessionEditable(ctx, userId, sessionExercise.sessionId);

  const sets = await ctx.db
    .query("sets")
    .withIndex("by_session_exercise", (q) =>
      q.eq("sessionExerciseId", sessionExerciseId),
    )
    .collect();
  sets.sort((a, b) => a.orderIndex - b.orderIndex);
  if (sets.length >= MAX_SETS_PER_EXERCISE) {
    throw new Error(
      `Exercises can contain at most ${MAX_SETS_PER_EXERCISE} sets`,
    );
  }

  const last = sets[sets.length - 1];
  const session = await ctx.db.get(sessionExercise.sessionId);
  const fallback = last
    ? null
    : await lastSetForExercise(ctx, userId, sessionExercise.exerciseSlug, {
        placeId: session?.placeId,
        machineId: sessionExercise.machineId,
      });

  return await ctx.db.insert("sets", {
    sessionExerciseId,
    orderIndex: (last?.orderIndex ?? -1) + 1,
    targetWeight: last?.targetWeight ?? last?.weight ?? fallback?.weight ?? 0,
    targetReps: last?.targetReps ?? last?.reps ?? fallback?.reps ?? 0,
    weight: last?.weight ?? fallback?.weight ?? 0,
    reps: last?.reps ?? fallback?.reps ?? 0,
    completed: false,
  });
}

export async function deleteSet(
  ctx: MutationCtx,
  userId: Id<"users">,
  setId: Id<"sets">,
) {
  const set = await ownedSetContext(ctx, userId, setId);
  const sessionExercise = await ctx.db.get(set.sessionExerciseId);
  if (!sessionExercise) throw new Error("Set not found");
  await assertSessionEditable(ctx, userId, sessionExercise.sessionId);

  const sets = await ctx.db
    .query("sets")
    .withIndex("by_session_exercise", (q) =>
      q.eq("sessionExerciseId", set.sessionExerciseId),
    )
    .collect();
  if (sets.length <= 1) throw new Error("Cannot delete the last set");

  await ctx.db.delete(setId);

  const remaining = sets
    .filter((s) => s._id !== setId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  await Promise.all(
    remaining.map((s, i) =>
      s.orderIndex === i
        ? Promise.resolve()
        : ctx.db.patch(s._id, { orderIndex: i }),
    ),
  );
}

export async function moveSessionExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionExerciseId: Id<"sessionExercises">,
  delta: number,
) {
  if (!Number.isInteger(delta) || Math.abs(delta) !== 1) {
    throw new Error("Exercise move delta must be -1 or 1");
  }
  const sessionExercise = await ctx.db.get(sessionExerciseId);
  if (!sessionExercise) throw new Error("Exercise not found");
  await assertSessionEditable(ctx, userId, sessionExercise.sessionId);

  const exercises = await sessionExercisesFor(ctx, sessionExercise.sessionId);
  const index = exercises.findIndex((e) => e._id === sessionExerciseId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= exercises.length) return;

  const current = exercises[index];
  const swap = exercises[target];
  await ctx.db.patch(current._id, { orderIndex: swap.orderIndex });
  await ctx.db.patch(swap._id, { orderIndex: current.orderIndex });
}

export async function addSessionExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    sessionId,
    exerciseSlug,
  }: {
    sessionId: Id<"workoutSessions">;
    exerciseSlug: Doc<"sessionExercises">["exerciseSlug"];
  },
) {
  await assertSessionEditable(ctx, userId, sessionId);

  const exercises = await sessionExercisesFor(ctx, sessionId);
  if (exercises.length >= MAX_EXERCISES_PER_SESSION) {
    throw new Error(
      `Workouts can contain at most ${MAX_EXERCISES_PER_SESSION} exercises`,
    );
  }
  const normalizedSlug = normalizeExerciseSlug(exerciseSlug);
  if (exercises.some((e) => e.exerciseSlug === normalizedSlug))
    throw new Error("Exercise already in workout");

  const orderIndex =
    exercises.length > 0 ? exercises[exercises.length - 1].orderIndex + 1 : 0;
  const session = await ctx.db.get(sessionId);
  const machine =
    session?.placeId != null
      ? await lastMachineForLift(ctx, userId, session.placeId, normalizedSlug)
      : null;
  const memory =
    session?.placeId != null
      ? await getWorkingSets(ctx, {
          placeId: session.placeId,
          exerciseSlug: normalizedSlug,
          machineId: machine?._id,
        })
      : null;
  const fallback =
    memory?.[0] ??
    (await lastSetForExercise(ctx, userId, normalizedSlug, {
      placeId: session?.placeId,
      machineId: machine?._id,
    }));

  const sessionExerciseId = await ctx.db.insert("sessionExercises", {
    sessionId,
    exerciseSlug: normalizedSlug,
    orderIndex,
    restSeconds: DEFAULT_REST_SECONDS,
    machineId: machine?._id,
    machineName: machine?.name,
  });

  const seed = fallback ?? { weight: 0, reps: 0 };
  await Promise.all(
    Array.from({ length: DEFAULT_SET_ROWS }, (_, i) =>
      ctx.db.insert("sets", {
        sessionExerciseId,
        orderIndex: i,
        targetWeight: seed.weight,
        targetReps: seed.reps,
        weight: seed.weight,
        reps: seed.reps,
        completed: false,
      }),
    ),
  );

  return sessionExerciseId;
}

const MAX_DRAFT_EXERCISES = 20;

type DraftExercise = {
  slug: string;
  sets: Array<{ weight: number; reps: number }>;
};

type UndoSetSnapshot = {
  orderIndex: number;
  weight: number;
  reps: number;
  targetWeight?: number;
  targetReps?: number;
  completed: boolean;
  completedAt?: number;
};

type UndoExerciseSnapshot = {
  exerciseSlug: string;
  orderIndex: number;
  restSeconds?: number;
  sets: UndoSetSnapshot[];
};

/**
 * Apply an AI session reshape: remove existing exercises (snapshotted for
 * undo) and/or append new ones tagged with aiGenerationId.
 */
export async function addExercisesFromDraft(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    sessionId,
    exercises,
    removeSlugs = [],
    aiGenerationId,
  }: {
    sessionId: Id<"workoutSessions">;
    exercises: DraftExercise[];
    removeSlugs?: string[];
    aiGenerationId?: string;
  },
): Promise<{
  ids: Id<"sessionExercises">[];
  generationId: string | null;
  removedCount: number;
}> {
  if (exercises.length > MAX_DRAFT_EXERCISES) {
    throw new Error(
      `AI drafts can add at most ${MAX_DRAFT_EXERCISES} exercises`,
    );
  }
  if (removeSlugs.length > MAX_EXERCISES_PER_SESSION) {
    throw new Error("AI draft contains too many removals");
  }
  if (aiGenerationId && aiGenerationId.trim().length > 64) {
    throw new Error("AI generation id is too long");
  }

  const session = await assertSessionEditable(ctx, userId, sessionId);

  const existing = await sessionExercisesFor(ctx, sessionId);
  const bySlug = new Map(existing.map((e) => [e.exerciseSlug, e]));
  const generationId = aiGenerationId?.trim() || null;

  const removedSnapshots: UndoExerciseSnapshot[] = [];
  const toRemove = [
    ...new Set(removeSlugs.map((s) => s.trim()).filter(Boolean)),
  ];

  for (const slug of toRemove) {
    const exercise = bySlug.get(slug);
    if (!exercise) continue;

    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", exercise._id),
      )
      .collect();
    sets.sort((a, b) => a.orderIndex - b.orderIndex);

    removedSnapshots.push({
      exerciseSlug: exercise.exerciseSlug,
      orderIndex: exercise.orderIndex,
      restSeconds: exercise.restSeconds,
      sets: sets.map((s) => ({
        orderIndex: s.orderIndex,
        weight: s.weight,
        reps: s.reps,
        targetWeight: s.targetWeight,
        targetReps: s.targetReps,
        completed: s.completed,
        completedAt: s.completedAt,
      })),
    });

    await Promise.all(sets.map((set) => ctx.db.delete(set._id)));
    await ctx.db.delete(exercise._id);
    bySlug.delete(slug);
  }

  const remainingAfterRemove = await sessionExercisesFor(ctx, sessionId);
  const usedSlugs = new Set(remainingAfterRemove.map((e) => e.exerciseSlug));
  let nextOrder =
    remainingAfterRemove.length > 0
      ? remainingAfterRemove[remainingAfterRemove.length - 1].orderIndex + 1
      : 0;

  const addedIds: Id<"sessionExercises">[] = [];

  for (const draft of exercises) {
    const slug = normalizeExerciseSlug(draft.slug);
    if (!slug || usedSlugs.has(slug)) continue;

    if (draft.sets.length > MAX_SETS_PER_EXERCISE) {
      throw new Error(
        `Exercises can contain at most ${MAX_SETS_PER_EXERCISE} sets`,
      );
    }
    const sets = draft.sets.map((s) => ({
      weight: boundedWhole(s.weight, MAX_WEIGHT, "Weight"),
      reps: boundedWhole(s.reps, MAX_REPS, "Reps"),
    }));
    const presets = sets.length ? sets : [{ weight: 0, reps: 0 }];

    const sessionExerciseId = await ctx.db.insert("sessionExercises", {
      sessionId,
      exerciseSlug: slug,
      orderIndex: nextOrder,
      restSeconds: DEFAULT_REST_SECONDS,
      ...(generationId ? { aiGenerationId: generationId } : {}),
    });
    nextOrder += 1;
    usedSlugs.add(slug);

    for (const [i, preset] of presets.entries()) {
      await ctx.db.insert("sets", {
        sessionExerciseId,
        orderIndex: i,
        targetWeight: preset.weight,
        targetReps: preset.reps,
        weight: preset.weight,
        reps: preset.reps,
        completed: false,
      });
    }

    addedIds.push(sessionExerciseId);
  }

  if (addedIds.length === 0 && removedSnapshots.length === 0) {
    throw new Error("No changes to apply");
  }

  // Reindex remaining + newly added in order
  const finalExercises = await sessionExercisesFor(ctx, sessionId);
  await Promise.all(
    finalExercises.map((exercise, i) =>
      exercise.orderIndex === i
        ? Promise.resolve()
        : ctx.db.patch(exercise._id, { orderIndex: i }),
    ),
  );

  if (generationId) {
    await ctx.db.patch(session._id, {
      aiUndoBatch: {
        generationId,
        removed: removedSnapshots,
      },
    });
  } else if (session.aiUndoBatch) {
    await ctx.db.patch(session._id, { aiUndoBatch: undefined });
  }

  return {
    ids: addedIds,
    generationId,
    removedCount: removedSnapshots.length,
  };
}

/**
 * Undo an AI reshape: delete batch-added exercises with no completed sets,
 * and restore any exercises that were removed in that batch.
 */
export async function undoAiGeneration(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    sessionId,
    generationId,
  }: {
    sessionId: Id<"workoutSessions">;
    generationId: string;
  },
): Promise<{ removed: number; kept: number; restored: number }> {
  const session = await assertSessionEditable(ctx, userId, sessionId);

  const trimmed = generationId.trim();
  if (!trimmed) throw new Error("Missing generation id");
  if (trimmed.length > 64) throw new Error("AI generation id is too long");

  const batch = await ctx.db
    .query("sessionExercises")
    .withIndex("by_session_generation", (q) =>
      q.eq("sessionId", sessionId).eq("aiGenerationId", trimmed),
    )
    .collect();

  let removed = 0;
  let kept = 0;

  for (const exercise of batch) {
    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", exercise._id),
      )
      .collect();
    if (sets.some((s) => s.completed)) {
      kept += 1;
      continue;
    }
    await Promise.all(sets.map((set) => ctx.db.delete(set._id)));
    await ctx.db.delete(exercise._id);
    removed += 1;
  }

  let restored = 0;
  const undoBatch =
    session.aiUndoBatch?.generationId === trimmed ? session.aiUndoBatch : null;

  if (undoBatch) {
    const existing = await sessionExercisesFor(ctx, sessionId);
    const usedSlugs = new Set(existing.map((e) => e.exerciseSlug));
    let nextOrder =
      existing.length > 0 ? existing[existing.length - 1].orderIndex + 1 : 0;

    for (const snap of undoBatch.removed) {
      if (usedSlugs.has(snap.exerciseSlug)) continue;

      const sessionExerciseId = await ctx.db.insert("sessionExercises", {
        sessionId,
        exerciseSlug: snap.exerciseSlug,
        orderIndex: nextOrder,
        restSeconds: snap.restSeconds ?? DEFAULT_REST_SECONDS,
      });
      nextOrder += 1;
      usedSlugs.add(snap.exerciseSlug);

      for (const s of snap.sets) {
        await ctx.db.insert("sets", {
          sessionExerciseId,
          orderIndex: s.orderIndex,
          targetWeight: s.targetWeight ?? s.weight,
          targetReps: s.targetReps ?? s.reps,
          weight: s.weight,
          reps: s.reps,
          completed: s.completed,
          completedAt: s.completedAt,
        });
      }
      restored += 1;
    }

    await ctx.db.patch(session._id, { aiUndoBatch: undefined });
  }

  if (removed === 0 && kept === 0 && restored === 0) {
    throw new Error("Nothing to undo");
  }

  const remaining = await sessionExercisesFor(ctx, sessionId);
  await Promise.all(
    remaining.map((exercise, i) =>
      exercise.orderIndex === i
        ? Promise.resolve()
        : ctx.db.patch(exercise._id, { orderIndex: i }),
    ),
  );

  return { removed, kept, restored };
}

/** Remove an exercise (and its sets) from an in-progress workout. */
export async function removeSessionExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionExerciseId: Id<"sessionExercises">,
) {
  const sessionExercise = await ctx.db.get(sessionExerciseId);
  if (!sessionExercise) throw new Error("Exercise not found");
  await assertSessionEditable(ctx, userId, sessionExercise.sessionId);

  const sets = await ctx.db
    .query("sets")
    .withIndex("by_session_exercise", (q) =>
      q.eq("sessionExerciseId", sessionExerciseId),
    )
    .collect();
  await Promise.all(sets.map((set) => ctx.db.delete(set._id)));
  await ctx.db.delete(sessionExerciseId);

  const remaining = await sessionExercisesFor(ctx, sessionExercise.sessionId);
  await Promise.all(
    remaining.map((exercise, i) =>
      exercise.orderIndex === i
        ? Promise.resolve()
        : ctx.db.patch(exercise._id, { orderIndex: i }),
    ),
  );
}

export async function finishWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ownedSession(ctx, userId, sessionId);
  if (session.status !== "in_progress") {
    throw new Error("Workout is no longer active");
  }

  const exercises = await sessionExercisesFor(ctx, sessionId);
  if (exercises.length === 0) {
    throw new Error("Add at least one exercise before finishing");
  }
  if (!(await sessionHasLoggedWork(ctx, sessionId))) {
    throw new Error("Check off at least one set with reps before finishing");
  }

  await ctx.db.patch(sessionId, {
    status: "completed",
    completedAt: Date.now(),
  });
  await recordSessionPlaceMemory(ctx, userId, sessionId);
}

export async function abandonWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ownedSession(ctx, userId, sessionId);
  if (session.status === "in_progress") {
    await ctx.db.patch(sessionId, { status: "abandoned" });
  }
}

/** Permanently remove a finished or abandoned session from history. */
export async function deleteWorkout(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ownedSession(ctx, userId, sessionId);
  if (session.status === "in_progress") {
    throw new Error("Cannot delete an active workout");
  }

  const exercises = await sessionExercisesFor(ctx, sessionId);
  for (const exercise of exercises) {
    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", exercise._id),
      )
      .collect();
    await Promise.all(sets.map((set) => ctx.db.delete(set._id)));
    await ctx.db.delete(exercise._id);
  }
  await ctx.db.delete(sessionId);
}

export async function getRecentWorkouts(ctx: QueryCtx, userId: Id<"users">) {
  const completed = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();
  completed.sort(
    (a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
  );

  const sessions = await Promise.all(
    completed.slice(0, 5).map(async (s) => {
      const template = s.templateId ? await ctx.db.get(s.templateId) : null;
      const exercises = await ctx.db
        .query("sessionExercises")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
        .collect();
      exercises.sort((a, b) => a.orderIndex - b.orderIndex);

      const summary = await Promise.all(
        exercises.map(async (e) => {
          const sets = await ctx.db
            .query("sets")
            .withIndex("by_session_exercise", (q) =>
              q.eq("sessionExerciseId", e._id),
            )
            .collect();
          return {
            slug: e.exerciseSlug,
            setCount: sets.length,
            completedCount: sets.filter((s) => s.completed).length,
          };
        }),
      );

      return {
        _id: s._id,
        completedAt: s.completedAt ?? s.startedAt,
        templateName: sessionDisplayName(template, s.templateName),
        exercises: summary,
      };
    }),
  );

  return { total: completed.length, sessions };
}

export async function getActiveWorkout(ctx: QueryCtx, userId: Id<"users">) {
  const session = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "in_progress"),
    )
    .first();
  if (!session) return null;

  const template = session.templateId
    ? await ctx.db.get(session.templateId)
    : null;
  return {
    _id: session._id,
    templateId: session.templateId ?? null,
    templateName: sessionDisplayName(template, session.templateName),
    startedAt: session.startedAt,
  };
}

export async function getWorkoutHistory(
  ctx: QueryCtx,
  userId: Id<"users">,
  templateId: Id<"workoutTemplates">,
) {
  const sessions = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();

  const forTemplate = sessions
    .filter((s) => s.templateId !== undefined && s.templateId === templateId)
    .sort(
      (a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
    );

  return await Promise.all(
    forTemplate.map(async (s) => {
      const exercises = await ctx.db
        .query("sessionExercises")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
        .collect();
      exercises.sort((a, b) => a.orderIndex - b.orderIndex);

      const summary = await Promise.all(
        exercises.map(async (e) => {
          const sets = await ctx.db
            .query("sets")
            .withIndex("by_session_exercise", (q) =>
              q.eq("sessionExerciseId", e._id),
            )
            .collect();
          return {
            slug: e.exerciseSlug,
            setCount: sets.length,
            completedCount: sets.filter((x) => x.completed).length,
          };
        }),
      );

      return {
        _id: s._id,
        completedAt: s.completedAt ?? s.startedAt,
        exercises: summary,
      };
    }),
  );
}

export async function getWorkout(
  ctx: QueryCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId) return null;

  const template = session.templateId
    ? await ctx.db.get(session.templateId)
    : null;

  const exercises = await ctx.db
    .query("sessionExercises")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
  exercises.sort((a, b) => a.orderIndex - b.orderIndex);

  const slugs = exercises.map((e) => e.exerciseSlug);
  const notesBySlug = await getNotesBySlugs(ctx, userId, slugs);

  const withSets = await Promise.all(
    exercises.map(async (e) => {
      const sets = await ctx.db
        .query("sets")
        .withIndex("by_session_exercise", (q) =>
          q.eq("sessionExerciseId", e._id),
        )
        .collect();
      sets.sort((a, b) => a.orderIndex - b.orderIndex);
      return {
        _id: e._id,
        slug: e.exerciseSlug,
        restSeconds: e.restSeconds ?? DEFAULT_REST_SECONDS,
        notes: notesBySlug[e.exerciseSlug],
        machineId: e.machineId ?? null,
        machineName: e.machineName ?? null,
        sets: sets.map((set) => ({
          ...set,
          targetWeight: set.targetWeight ?? set.weight,
          targetReps: set.targetReps ?? set.reps,
          completedAt: set.completedAt,
        })),
      };
    }),
  );

  const place =
    session.placeId != null ? await ctx.db.get(session.placeId) : null;
  const starred = await findStarredPlace(ctx, userId);

  return {
    _id: session._id,
    status: session.status,
    templateId: session.templateId ?? null,
    templateName: sessionDisplayName(template, session.templateName),
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    placeId: session.placeId ?? starred?._id ?? null,
    placeName: session.placeName ?? place?.name ?? starred?.name ?? null,
    placeStarred: place?.starred ?? starred?.starred ?? true,
    sessionKind: normalizeSessionKind(session.sessionKind),
    countsTowardGoals: session.countsTowardGoals !== false,
    sourceName: session.sourceName ?? null,
    activityType: session.activityType ?? null,
    durationSeconds: session.durationSeconds ?? null,
    energyKcal: session.energyKcal ?? null,
    distanceMeters: session.distanceMeters ?? null,
    exercises: withSets,
  };
}

type RecapSet = {
  slug: string;
  weight: number;
  reps: number;
  completed: boolean;
};

type BestSet = { weight: number; reps: number };

function isInverseWeightSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  // Assisted pull-ups/dips typically use "assisted" in the slug (including
  // custom user-authored lifts). Counterweighted variants follow the same
  // convention.
  return (
    s.includes("assisted") ||
    s.includes("counterweighted") ||
    s.includes("counterweight")
  );
}

function effectiveWeightForSlug(slug: string, weight: number): number {
  return isInverseWeightSlug(slug) ? -weight : weight;
}

function compareBestSetsForSlug(
  a: BestSet,
  b: BestSet,
  inverseWeight: boolean,
): number {
  const aw = inverseWeight ? -a.weight : a.weight;
  const bw = inverseWeight ? -b.weight : b.weight;
  if (aw !== bw) return aw - bw;
  return a.reps - b.reps;
}

function betterBestSetForSlug(
  a: BestSet | null,
  b: BestSet,
  inverseWeight: boolean,
): BestSet {
  if (!a || compareBestSetsForSlug(b, a, inverseWeight) > 0) return b;
  return a;
}

function compareRecapSets(a: RecapSet, b: RecapSet): number {
  const aw = effectiveWeightForSlug(a.slug, a.weight);
  const bw = effectiveWeightForSlug(b.slug, b.weight);
  if (aw !== bw) return aw - bw;
  return a.reps - b.reps;
}

/** Checked-off sets that count toward recap totals (weight may be 0). */
function loggedDoneSets(exercises: { slug: string; sets: Doc<"sets">[] }[]) {
  const sets: RecapSet[] = [];
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!isLoggedSet(set)) continue;
      sets.push({
        slug: exercise.slug,
        weight: set.weight,
        reps: set.reps,
        completed: set.completed,
      });
    }
  }
  return sets;
}

async function completedSessionsForUser(ctx: QueryCtx, userId: Id<"users">) {
  const sessions = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();
  sessions.sort(
    (a, b) => (a.completedAt ?? a.startedAt) - (b.completedAt ?? b.startedAt),
  );
  return sessions;
}

type ProgressionPoint = {
  completedAt: number;
  weight: number;
  reps: number;
  est1RM: number;
  sameTemplate: boolean;
  samePlace: boolean;
};

async function bestSetForSlugInSession(
  ctx: QueryCtx,
  sessionDoc: Doc<"workoutSessions">,
  slug: string,
): Promise<(BestSet & { est1RM: number }) | null> {
  const exercises = await ctx.db
    .query("sessionExercises")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionDoc._id))
    .collect();
  const match = exercises.find((e) => e.exerciseSlug === slug);
  if (!match) return null;

  const sets = await ctx.db
    .query("sets")
    .withIndex("by_session_exercise", (q) =>
      q.eq("sessionExerciseId", match._id),
    )
    .collect();

  const inverseWeight = isInverseWeightSlug(slug);
  let best: BestSet | null = null;
  for (const set of sets) {
    if (!isLoggedSet(set)) continue;
    best = betterBestSetForSlug(
      best,
      { weight: set.weight, reps: set.reps },
      inverseWeight,
    );
  }
  if (!best) return null;
  return { ...best, est1RM: estimate1RM(best.weight, best.reps) };
}

export async function getWorkoutRecap(
  ctx: QueryCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await getWorkout(ctx, userId, sessionId);
  if (!session) return null;

  const completedAt = session.completedAt ?? session.startedAt;
  const doneSets = loggedDoneSets(session.exercises);
  const totalVolume = doneSets.reduce(
    (sum, set) => sum + set.weight * set.reps,
    0,
  );
  // Heavier weight wins; among weight-0 (bodyweight / unset) sets, more reps.
  // Assisted/counterweighted lifts invert that: less assistance is better.
  const standout =
    [...doneSets].sort((a, b) => compareRecapSets(b, a))[0] ?? null;

  const completedSessions = await completedSessionsForUser(ctx, userId);
  const meaningfulAts: number[] = [];
  for (const s of completedSessions) {
    const ts = s.completedAt ?? s.startedAt;
    if (ts > completedAt) continue;
    const counts =
      s.sessionKind === "health_summary"
        ? s.countsTowardGoals !== false
        : await sessionHasLoggedWork(ctx, s._id);
    if (counts) meaningfulAts.push(ts);
  }
  const weekStart = startOfWeekMonday(completedAt);
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const weekAts = meaningfulAts.filter((ts) => ts >= weekStart && ts < weekEnd);
  const sessionsThisWeek = weekAts.length;
  // Mon–Sun flags for the week containing this session.
  const daysWorked = [false, false, false, false, false, false, false] as [
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
  ];
  for (const ts of weekAts) {
    const day = new Date(ts).getDay(); // 0 = Sun
    const monIndex = day === 0 ? 6 : day - 1;
    daysWorked[monIndex] = true;
  }

  const allPoints: ProgressionPoint[] = [];
  let priorBest: BestSet | null = null;
  const home = await findStarredPlace(ctx, userId);
  const placeId = session.placeId;
  if (standout) {
    const standoutInverseWeight = isInverseWeightSlug(standout.slug);
    for (const s of completedSessions) {
      const ts = s.completedAt ?? s.startedAt;
      if (ts > completedAt) continue;
      const best = await bestSetForSlugInSession(ctx, s, standout.slug);
      if (!best) continue;
      const samePlace =
        !placeId || sessionMatchesPlace(s, placeId, home?._id ?? null);
      if (samePlace && s._id !== sessionId && ts < completedAt) {
        priorBest = betterBestSetForSlug(
          priorBest,
          best,
          standoutInverseWeight,
        );
      }
      allPoints.push({
        completedAt: ts,
        weight: best.weight,
        reps: best.reps,
        est1RM: best.est1RM,
        sameTemplate:
          session.templateId !== null &&
          s.templateId !== undefined &&
          s.templateId === session.templateId,
        samePlace,
      });
    }
  }

  // Prefer same-place lineage so Elgin 300 doesn't look like a Home deload.
  const samePlacePoints = allPoints.filter((p) => p.samePlace);
  const sameTemplatePoints = samePlacePoints.filter((p) => p.sameTemplate);
  const useTemplateLineage = sameTemplatePoints.length >= 2;
  const lineagePoints = useTemplateLineage
    ? sameTemplatePoints
    : samePlacePoints.length >= 2
      ? samePlacePoints
      : allPoints;
  const chartPoints = lineagePoints.slice(-7);

  const todayPoint = chartPoints[chartPoints.length - 1] ?? null;
  const previousPoint =
    chartPoints.length >= 2 ? chartPoints[chartPoints.length - 2] : null;
  const isBaseline = chartPoints.length < 2;

  const vsPreviousWeight =
    todayPoint && previousPoint
      ? todayPoint.weight - previousPoint.weight
      : null;

  const isInverseWeight = standout ? isInverseWeightSlug(standout.slug) : false;

  return {
    session,
    totals: {
      volume: totalVolume,
      durationMs:
        session.durationSeconds != null
          ? session.durationSeconds * 1000
          : Math.max(0, completedAt - session.startedAt),
      completedSets: doneSets.length,
      exerciseCount: session.exercises.filter((exercise) =>
        exercise.sets.some((set) => isLoggedSet(set)),
      ).length,
    },
    standout: standout
      ? {
          slug: standout.slug,
          weight: standout.weight,
          reps: standout.reps,
          est1RM: estimate1RM(standout.weight, standout.reps),
          isPr: priorBest
            ? compareBestSetsForSlug(
                { weight: standout.weight, reps: standout.reps },
                priorBest,
                isInverseWeight,
              ) > 0
            : true,
          priorBest,
        }
      : null,
    muscleSets: session.exercises.map((exercise) => ({
      slug: exercise.slug,
      sets: exercise.sets.filter((set) => isLoggedSet(set)).length,
    })),
    /** @deprecated Prefer `progressionStory` — kept for older clients. */
    progression: chartPoints.map((p) => ({
      completedAt: p.completedAt,
      est1RM: p.est1RM,
    })),
    progressionStory:
      standout && chartPoints.length > 0
        ? {
            slug: standout.slug,
            scopedToTemplate: useTemplateLineage,
            isBaseline,
            isInverseWeight,
            points: chartPoints,
            today: todayPoint
              ? {
                  weight: todayPoint.weight,
                  reps: todayPoint.reps,
                  est1RM: todayPoint.est1RM,
                }
              : null,
            previous: previousPoint
              ? {
                  weight: previousPoint.weight,
                  reps: previousPoint.reps,
                  est1RM: previousPoint.est1RM,
                  completedAt: previousPoint.completedAt,
                }
              : null,
            vsPreviousWeight,
          }
        : null,
    consistency: {
      sessionsThisWeek,
      weeklyGoal: 4,
      weekStreak: computeWeekStreak(meaningfulAts, completedAt),
      /** Mon–Sun: true if at least one logged workout that day. */
      daysWorked,
    },
  };
}
