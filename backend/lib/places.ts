import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  DEFAULT_MACHINE_KEY,
  HOME_PLACE_NAME,
  MAX_MACHINES_PER_LIFT,
  MAX_PLACES,
  USUAL_MACHINE_NAME,
  normalizePlaceName,
  placeNameKey,
  reseedIncompleteSets,
  seedSetRows,
  type MemorySet,
} from "./placeMemory";
import { normalizeTemplateSets } from "./templates";

export {
  DEFAULT_MACHINE_KEY,
  HOME_PLACE_NAME,
  USUAL_MACHINE_NAME,
  sessionMatchesPlace,
} from "./placeMemory";

type DbCtx = QueryCtx | MutationCtx;

export function machineKeyFor(
  machineId: Id<"machines"> | null | undefined,
): string {
  return machineId ?? DEFAULT_MACHINE_KEY;
}

function newClientId() {
  return crypto.randomUUID();
}

export async function listActivePlaces(ctx: DbCtx, userId: Id<"users">) {
  const places = await ctx.db
    .query("places")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return places
    .filter((place) => !place.archived)
    .sort((a, b) => {
      if (a.starred !== b.starred) return a.starred ? -1 : 1;
      const aUsed = a.lastUsedAt ?? 0;
      const bUsed = b.lastUsedAt ?? 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      return a.name.localeCompare(b.name);
    });
}

export async function findStarredPlace(ctx: DbCtx, userId: Id<"users">) {
  const places = await ctx.db
    .query("places")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return places.find((place) => place.starred && !place.archived) ?? null;
}

/** Idempotent: every account gets a starred Home. */
export async function ensureHomePlace(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"places">> {
  const existing = await findStarredPlace(ctx, userId);
  if (existing) return existing;

  const places = await ctx.db
    .query("places")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const namedHome = places.find(
    (place) => !place.archived && placeNameKey(place.name) === "home",
  );
  if (namedHome) {
    if (!namedHome.starred) {
      for (const place of places) {
        if (place.starred && place._id !== namedHome._id) {
          await ctx.db.patch(place._id, { starred: false });
        }
      }
      await ctx.db.patch(namedHome._id, { starred: true });
    }
    return { ...namedHome, starred: true };
  }

  const id = await ctx.db.insert("places", {
    userId,
    name: HOME_PLACE_NAME,
    starred: true,
    archived: false,
    clientId: newClientId(),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create Home");
  return created;
}

async function ownedPlace(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  placeId: Id<"places">,
) {
  const place = await ctx.db.get(placeId);
  if (!place || place.userId !== userId) throw new Error("Place not found");
  if (place.archived) throw new Error("Place not found");
  return place;
}

export async function resolvePlaceForStart(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    placeId,
    templateId,
  }: {
    placeId?: Id<"places">;
    templateId?: Id<"workoutTemplates">;
  },
) {
  const home = await ensureHomePlace(ctx, userId);
  if (placeId) return await ownedPlace(ctx, userId, placeId);

  if (templateId) {
    const template = await ctx.db.get(templateId);
    if (template?.lastPlaceId) {
      const last = await ctx.db.get(template.lastPlaceId);
      if (last && last.userId === userId && !last.archived) return last;
    }
  }

  const lastSession = await latestCompletedSession(ctx, userId);
  if (lastSession?.placeId) {
    const last = await ctx.db.get(lastSession.placeId);
    if (last && last.userId === userId && !last.archived) return last;
  }

  return home;
}

export async function latestCompletedSession(ctx: DbCtx, userId: Id<"users">) {
  const completed = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();
  completed.sort(
    (a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
  );
  return completed[0] ?? null;
}

export async function createPlace(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
) {
  await ensureHomePlace(ctx, userId);
  const normalized = normalizePlaceName(name);
  const places = await ctx.db
    .query("places")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const active = places.filter((place) => !place.archived);
  if (active.length >= MAX_PLACES) {
    throw new Error(`You can have at most ${MAX_PLACES} places`);
  }
  const taken = active.some(
    (place) => placeNameKey(place.name) === placeNameKey(normalized),
  );
  if (taken) throw new Error("You already have a place with that name");

  return await ctx.db.insert("places", {
    userId,
    name: normalized,
    starred: false,
    archived: false,
    clientId: newClientId(),
  });
}

/**
 * Create-or-update a place authored offline, keyed by the phone's client id.
 * Home also merges by name so a locally-created Home doesn't duplicate the
 * starred Home Convex already provisioned.
 */
export async function upsertPlaceFromClient(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    clientId: string;
    name: string;
    starred: boolean;
    archived: boolean;
  },
) {
  await ensureHomePlace(ctx, userId);
  const normalized = normalizePlaceName(args.name);
  const places = await ctx.db
    .query("places")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const byClient = places.find((place) => place.clientId === args.clientId);
  const byName = places.find(
    (place) =>
      !place.archived && placeNameKey(place.name) === placeNameKey(normalized),
  );
  const existing = byClient ?? byName ?? null;

  if (existing) {
    if (existing.starred && args.archived) {
      throw new Error("Star another place before removing Home");
    }
    // Never leave the account with no Home. If this payload unstars the
    // current Home, keep it starred until a later upsert stars another place.
    const starred = args.starred || (existing.starred && !args.archived);
    if (starred) {
      for (const row of places) {
        const nextStarred = row._id === existing._id;
        if (row.starred !== nextStarred) {
          await ctx.db.patch(row._id, { starred: nextStarred });
        }
      }
    }
    await ctx.db.patch(existing._id, {
      name: normalized,
      starred,
      archived: args.archived,
      clientId: existing.clientId ?? args.clientId,
    });
    return existing._id;
  }

  const active = places.filter((place) => !place.archived);
  if (!args.archived && active.length >= MAX_PLACES) {
    throw new Error(`You can have at most ${MAX_PLACES} places`);
  }

  const id = await ctx.db.insert("places", {
    userId,
    name: normalized,
    starred: args.starred,
    archived: args.archived,
    clientId: args.clientId,
  });
  if (args.starred) {
    for (const row of places) {
      if (row.starred) await ctx.db.patch(row._id, { starred: false });
    }
  }
  return id;
}

/**
 * Create-or-update a machine authored offline. The phone forks "Usual" itself
 * and uploads that row first — this does not auto-fork.
 */
export async function upsertMachineFromClient(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    clientId: string;
    placeClientId: string;
    exerciseSlug: string;
    name: string;
    isDefault: boolean;
    archived: boolean;
  },
) {
  const byClientPlace = await ctx.db
    .query("places")
    .withIndex("by_user_client_id", (q) =>
      q.eq("userId", userId).eq("clientId", args.placeClientId),
    )
    .first();
  const placeId = ctx.db.normalizeId("places", args.placeClientId);
  const byRemote = placeId && !byClientPlace ? await ctx.db.get(placeId) : null;
  const place =
    byClientPlace ?? (byRemote?.userId === userId ? byRemote : null);

  if (!place) {
    throw new Error("Place not found");
  }

  const normalized = normalizePlaceName(args.name);
  const existingByClient = await ctx.db
    .query("machines")
    .withIndex("by_user_client_id", (q) =>
      q.eq("userId", userId).eq("clientId", args.clientId),
    )
    .first();
  const siblings = await listMachinesForLift(
    ctx,
    userId,
    place._id,
    args.exerciseSlug,
  );
  const existing =
    existingByClient ??
    siblings.find(
      (machine) => placeNameKey(machine.name) === placeNameKey(normalized),
    ) ??
    null;

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: normalized,
      isDefault: args.isDefault,
      archived: args.archived,
      clientId: existing.clientId ?? args.clientId,
    });
    return existing._id;
  }

  if (!args.archived && siblings.length >= MAX_MACHINES_PER_LIFT) {
    throw new Error(
      `You can have at most ${MAX_MACHINES_PER_LIFT} machines for a lift`,
    );
  }

  return await ctx.db.insert("machines", {
    userId,
    placeId: place._id,
    exerciseSlug: args.exerciseSlug,
    name: normalized,
    isDefault: args.isDefault,
    archived: args.archived,
    clientId: args.clientId,
  });
}

export async function renamePlace(
  ctx: MutationCtx,
  userId: Id<"users">,
  placeId: Id<"places">,
  name: string,
) {
  const place = await ownedPlace(ctx, userId, placeId);
  const normalized = normalizePlaceName(name);
  const places = await listActivePlaces(ctx, userId);
  const taken = places.some(
    (row) =>
      row._id !== placeId &&
      placeNameKey(row.name) === placeNameKey(normalized),
  );
  if (taken) throw new Error("You already have a place with that name");
  await ctx.db.patch(place._id, { name: normalized });
}

export async function starPlace(
  ctx: MutationCtx,
  userId: Id<"users">,
  placeId: Id<"places">,
) {
  const place = await ownedPlace(ctx, userId, placeId);
  const places = await ctx.db
    .query("places")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const row of places) {
    const starred = row._id === place._id;
    if (row.starred !== starred) {
      await ctx.db.patch(row._id, { starred });
    }
  }
}

export async function archivePlace(
  ctx: MutationCtx,
  userId: Id<"users">,
  placeId: Id<"places">,
) {
  const place = await ownedPlace(ctx, userId, placeId);
  if (place.starred) {
    throw new Error("Star another place before removing Home");
  }
  const active = await listActivePlaces(ctx, userId);
  if (active.length <= 1) {
    throw new Error("Keep at least one place");
  }
  await ctx.db.patch(place._id, { archived: true, starred: false });
}

export async function listMachinesForLift(
  ctx: DbCtx,
  userId: Id<"users">,
  placeId: Id<"places">,
  exerciseSlug: string,
) {
  const place = await ctx.db.get(placeId);
  if (!place || place.userId !== userId || place.archived) {
    throw new Error("Place not found");
  }
  const machines = await ctx.db
    .query("machines")
    .withIndex("by_place_slug", (q) =>
      q.eq("placeId", placeId).eq("exerciseSlug", exerciseSlug),
    )
    .collect();
  return machines
    .filter((machine) => !machine.archived)
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      const aUsed = a.lastUsedAt ?? 0;
      const bUsed = b.lastUsedAt ?? 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      return a.name.localeCompare(b.name);
    });
}

export async function getWorkingSets(
  ctx: DbCtx,
  {
    placeId,
    exerciseSlug,
    machineId,
  }: {
    placeId: Id<"places">;
    exerciseSlug: string;
    machineId?: Id<"machines"> | null;
  },
): Promise<MemorySet[] | null> {
  const key = machineKeyFor(machineId);
  const row = await ctx.db
    .query("exercisePlaceWeights")
    .withIndex("by_place_slug_machine", (q) =>
      q
        .eq("placeId", placeId)
        .eq("exerciseSlug", exerciseSlug)
        .eq("machineKey", key),
    )
    .unique();
  if (row) return row.sets;

  if (machineId) {
    const machine = await ctx.db.get(machineId);
    if (machine?.isDefault) {
      const implicit = await ctx.db
        .query("exercisePlaceWeights")
        .withIndex("by_place_slug_machine", (q) =>
          q
            .eq("placeId", placeId)
            .eq("exerciseSlug", exerciseSlug)
            .eq("machineKey", DEFAULT_MACHINE_KEY),
        )
        .unique();
      if (implicit) return implicit.sets;
    }
  }
  return null;
}

export async function lastMachineForLift(
  ctx: DbCtx,
  userId: Id<"users">,
  placeId: Id<"places">,
  exerciseSlug: string,
) {
  const machines = await listMachinesForLift(
    ctx,
    userId,
    placeId,
    exerciseSlug,
  );
  if (machines.length === 0) return null;
  return (
    machines.find((machine) => machine.lastUsedAt) ??
    machines.find((machine) => machine.isDefault) ??
    machines[0]
  );
}

export function seedExerciseSets(
  templateSets: MemorySet[],
  memorySets: MemorySet[] | null,
) {
  return seedSetRows(templateSets, memorySets);
}

async function upsertWorkingSets(
  ctx: MutationCtx,
  {
    userId,
    placeId,
    exerciseSlug,
    machineId,
    sets,
  }: {
    userId: Id<"users">;
    placeId: Id<"places">;
    exerciseSlug: string;
    machineId?: Id<"machines"> | null;
    sets: MemorySet[];
  },
) {
  const machineKey = machineKeyFor(machineId);
  const existing = await ctx.db
    .query("exercisePlaceWeights")
    .withIndex("by_place_slug_machine", (q) =>
      q
        .eq("placeId", placeId)
        .eq("exerciseSlug", exerciseSlug)
        .eq("machineKey", machineKey),
    )
    .unique();
  const payload = {
    userId,
    placeId,
    exerciseSlug,
    machineKey,
    sets: normalizeTemplateSets(sets),
    updatedAt: Date.now(),
  };
  if (existing) await ctx.db.patch(existing._id, payload);
  else await ctx.db.insert("exercisePlaceWeights", payload);
}

/** Stamp the finished session onto this place's working-weight memory. */
export async function recordSessionPlaceMemory(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId) return;
  if (session.status !== "completed") return;
  if (session.sessionKind === "health_summary") return;

  const place =
    session.placeId != null
      ? await ctx.db.get(session.placeId)
      : await findStarredPlace(ctx, userId);
  if (!place || place.userId !== userId || place.archived) return;

  if (session.placeId !== place._id || session.placeName !== place.name) {
    await ctx.db.patch(sessionId, {
      placeId: place._id,
      placeName: place.name,
    });
  }

  await ctx.db.patch(place._id, { lastUsedAt: Date.now() });

  if (session.templateId) {
    const template = await ctx.db.get(session.templateId);
    if (template && template.userId === userId) {
      await ctx.db.patch(session.templateId, { lastPlaceId: place._id });
    }
  }

  const exercises = await ctx.db
    .query("sessionExercises")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
  exercises.sort((a, b) => a.orderIndex - b.orderIndex);

  for (const exercise of exercises) {
    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", exercise._id),
      )
      .collect();
    sets.sort((a, b) => a.orderIndex - b.orderIndex);
    if (sets.length === 0) continue;

    if (exercise.machineId) {
      const machine = await ctx.db.get(exercise.machineId);
      if (machine && machine.userId === userId && !machine.archived) {
        await ctx.db.patch(machine._id, { lastUsedAt: Date.now() });
      }
    }

    await upsertWorkingSets(ctx, {
      userId,
      placeId: place._id,
      exerciseSlug: exercise.exerciseSlug,
      machineId: exercise.machineId,
      sets: sets.map((set) => ({ weight: set.weight, reps: set.reps })),
    });
  }
}

export async function reseedSessionToPlace(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
  placeId: Id<"places">,
): Promise<{ hadCompletedSets: boolean; reseeded: number }> {
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Session not found");
  }
  if (session.status !== "in_progress") {
    throw new Error("Workout is no longer active");
  }
  const place = await ownedPlace(ctx, userId, placeId);

  await ctx.db.patch(sessionId, {
    placeId: place._id,
    placeName: place.name,
  });

  const exercises = await ctx.db
    .query("sessionExercises")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();

  let hadCompletedSets = false;
  let reseeded = 0;

  for (const exercise of exercises) {
    const machine = await lastMachineForLift(
      ctx,
      userId,
      place._id,
      exercise.exerciseSlug,
    );
    await ctx.db.patch(exercise._id, {
      machineId: machine?._id,
      machineName: machine?.name,
    });

    const sets = await ctx.db
      .query("sets")
      .withIndex("by_session_exercise", (q) =>
        q.eq("sessionExerciseId", exercise._id),
      )
      .collect();
    sets.sort((a, b) => a.orderIndex - b.orderIndex);
    if (sets.some((set) => set.completed)) hadCompletedSets = true;

    const memory = await getWorkingSets(ctx, {
      placeId: place._id,
      exerciseSlug: exercise.exerciseSlug,
      machineId: machine?._id,
    });
    const next = reseedIncompleteSets(sets, memory);
    for (let i = 0; i < sets.length; i++) {
      const current = sets[i];
      const updated = next[i];
      if (!current || !updated) continue;
      if (current.weight === updated.weight && current.reps === updated.reps) {
        continue;
      }
      await ctx.db.patch(current._id, {
        weight: updated.weight,
        reps: updated.reps,
        targetWeight: updated.weight,
        targetReps: updated.reps,
      });
      if (!current.completed) reseeded += 1;
    }
  }

  return { hadCompletedSets, reseeded };
}

export async function assignMachineToExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionExerciseId: Id<"sessionExercises">,
  machineId: Id<"machines">,
) {
  const exercise = await ctx.db.get(sessionExerciseId);
  if (!exercise) throw new Error("Exercise not found");
  const session = await ctx.db.get(exercise.sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Exercise not found");
  }
  if (session.status !== "in_progress") {
    throw new Error("Workout is no longer active");
  }
  if (!session.placeId) throw new Error("Pick a place first");

  const machine = await ctx.db.get(machineId);
  if (
    !machine ||
    machine.userId !== userId ||
    machine.archived ||
    machine.placeId !== session.placeId ||
    machine.exerciseSlug !== exercise.exerciseSlug
  ) {
    throw new Error("Machine not found");
  }

  await ctx.db.patch(sessionExerciseId, {
    machineId: machine._id,
    machineName: machine.name,
  });
  await reseedExerciseUnfinished(
    ctx,
    exercise._id,
    session.placeId,
    machine._id,
  );
}

async function reseedExerciseUnfinished(
  ctx: MutationCtx,
  sessionExerciseId: Id<"sessionExercises">,
  placeId: Id<"places">,
  machineId: Id<"machines"> | null,
) {
  const exercise = await ctx.db.get(sessionExerciseId);
  if (!exercise) return;
  const sets = await ctx.db
    .query("sets")
    .withIndex("by_session_exercise", (q) =>
      q.eq("sessionExerciseId", sessionExerciseId),
    )
    .collect();
  sets.sort((a, b) => a.orderIndex - b.orderIndex);
  const memory = await getWorkingSets(ctx, {
    placeId,
    exerciseSlug: exercise.exerciseSlug,
    machineId,
  });
  const next = reseedIncompleteSets(sets, memory);
  for (let i = 0; i < sets.length; i++) {
    const current = sets[i];
    const updated = next[i];
    if (!current || !updated) continue;
    if (current.weight === updated.weight && current.reps === updated.reps) {
      continue;
    }
    await ctx.db.patch(current._id, {
      weight: updated.weight,
      reps: updated.reps,
      targetWeight: updated.weight,
      targetReps: updated.reps,
    });
  }
}

/**
 * Fork a named machine at a place/lift without a live session. First named
 * machine promotes the implicit slot to "Usual".
 */
export async function createMachineAtPlace(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    placeId,
    exerciseSlug,
    name,
  }: {
    placeId: Id<"places">;
    exerciseSlug: string;
    name: string;
  },
) {
  await ownedPlace(ctx, userId, placeId);
  const normalized = normalizePlaceName(name);
  const existing = await listMachinesForLift(
    ctx,
    userId,
    placeId,
    exerciseSlug,
  );
  if (existing.length >= MAX_MACHINES_PER_LIFT) {
    throw new Error(
      `You can have at most ${MAX_MACHINES_PER_LIFT} machines for a lift`,
    );
  }
  if (
    existing.some(
      (machine) => placeNameKey(machine.name) === placeNameKey(normalized),
    )
  ) {
    throw new Error("That machine already exists here");
  }

  if (existing.length === 0) {
    const usualId = await ctx.db.insert("machines", {
      userId,
      placeId,
      exerciseSlug,
      name: USUAL_MACHINE_NAME,
      isDefault: true,
      archived: false,
      clientId: newClientId(),
    });
    const implicit = await ctx.db
      .query("exercisePlaceWeights")
      .withIndex("by_place_slug_machine", (q) =>
        q
          .eq("placeId", placeId)
          .eq("exerciseSlug", exerciseSlug)
          .eq("machineKey", DEFAULT_MACHINE_KEY),
      )
      .unique();
    if (implicit) {
      await ctx.db.patch(implicit._id, {
        machineKey: usualId,
      });
    }
  }

  return await ctx.db.insert("machines", {
    userId,
    placeId,
    exerciseSlug,
    name: normalized,
    isDefault: false,
    archived: false,
    clientId: newClientId(),
  });
}

/**
 * Add a named machine for this lift. The first fork promotes the implicit
 * slot to "Usual" so the picker is Usual vs Corner, not "—" vs Corner.
 */
export async function createNamedMachine(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    sessionExerciseId,
    name,
  }: {
    sessionExerciseId: Id<"sessionExercises">;
    name: string;
  },
) {
  const exercise = await ctx.db.get(sessionExerciseId);
  if (!exercise) throw new Error("Exercise not found");
  const session = await ctx.db.get(exercise.sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Exercise not found");
  }
  if (session.status !== "in_progress") {
    throw new Error("Workout is no longer active");
  }
  const placeId = session.placeId;
  if (!placeId) throw new Error("Pick a place first");
  await ownedPlace(ctx, userId, placeId);

  const createdId = await createMachineAtPlace(ctx, userId, {
    placeId,
    exerciseSlug: exercise.exerciseSlug,
    name,
  });

  await ctx.db.patch(sessionExerciseId, {
    machineId: createdId,
    machineName: (await ctx.db.get(createdId))?.name ?? name,
  });
  await reseedExerciseUnfinished(ctx, sessionExerciseId, placeId, createdId);
  return createdId;
}

export async function renameMachine(
  ctx: MutationCtx,
  userId: Id<"users">,
  machineId: Id<"machines">,
  name: string,
) {
  const machine = await ctx.db.get(machineId);
  if (!machine || machine.userId !== userId || machine.archived) {
    throw new Error("Machine not found");
  }
  const normalized = normalizePlaceName(name);
  const siblings = await listMachinesForLift(
    ctx,
    userId,
    machine.placeId,
    machine.exerciseSlug,
  );
  if (
    siblings.some(
      (row) =>
        row._id !== machineId &&
        placeNameKey(row.name) === placeNameKey(normalized),
    )
  ) {
    throw new Error("That machine already exists here");
  }
  await ctx.db.patch(machineId, { name: normalized });
}

export async function archiveMachine(
  ctx: MutationCtx,
  userId: Id<"users">,
  machineId: Id<"machines">,
) {
  const machine = await ctx.db.get(machineId);
  if (!machine || machine.userId !== userId || machine.archived) {
    throw new Error("Machine not found");
  }
  if (machine.isDefault) {
    throw new Error("Keep the usual machine");
  }
  await ctx.db.patch(machineId, { archived: true });
}

export function exerciseMatchesMachine(
  exercise: { machineId?: Id<"machines"> },
  machineId: Id<"machines"> | null | undefined,
  defaultMachineId: Id<"machines"> | null,
) {
  if (!machineId) {
    return !exercise.machineId || exercise.machineId === defaultMachineId;
  }
  if (exercise.machineId === machineId) return true;
  if (!exercise.machineId && defaultMachineId === machineId) return true;
  return false;
}

/** Public list shape for the place chip / settings. */
export function serializePlace(place: Doc<"places">) {
  return {
    _id: place._id,
    name: place.name,
    starred: place.starred,
    lastUsedAt: place.lastUsedAt ?? null,
  };
}

export function serializeMachine(machine: Doc<"machines">) {
  return {
    _id: machine._id,
    placeId: machine.placeId,
    exerciseSlug: machine.exerciseSlug,
    name: machine.name,
    isDefault: machine.isDefault,
    lastUsedAt: machine.lastUsedAt ?? null,
  };
}
