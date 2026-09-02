import { randomUUID } from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

import type {
  IosBootstrapPayload,
  LocalMachine,
  LocalPlace,
} from "@/data/local/types";
import {
  DEFAULT_MACHINE_KEY,
  HOME_PLACE_NAME,
  MAX_MACHINES_PER_LIFT,
  reseedIncompleteSets,
  seedSetRows,
  type MemorySet,
} from "@shared/place-memory";

type PlaceRow = {
  id: string;
  remote_id: string | null;
  name: string;
  starred: number;
  archived: number;
  last_used_at: number | null;
  updated_at: number;
};

type MachineRow = {
  id: string;
  remote_id: string | null;
  place_id: string;
  exercise_slug: string;
  name: string;
  is_default: number;
  archived: number;
  last_used_at: number | null;
  updated_at: number;
};

function mapPlace(row: PlaceRow): LocalPlace {
  return {
    _id: row.id,
    remoteId: row.remote_id,
    name: row.name,
    starred: row.starred === 1,
    archived: row.archived === 1,
    lastUsedAt: row.last_used_at,
    updatedAt: row.updated_at,
  };
}

function mapMachine(row: MachineRow): LocalMachine {
  return {
    _id: row.id,
    remoteId: row.remote_id,
    placeId: row.place_id,
    exerciseSlug: row.exercise_slug,
    name: row.name,
    isDefault: row.is_default === 1,
    archived: row.archived === 1,
    lastUsedAt: row.last_used_at,
    updatedAt: row.updated_at,
  };
}

export async function listLocalPlaces(
  db: SQLiteDatabase,
): Promise<LocalPlace[]> {
  const rows = await db.getAllAsync<PlaceRow>(
    `SELECT id, remote_id, name, starred, archived, last_used_at, updated_at
       FROM local_places
      WHERE archived = 0
      ORDER BY starred DESC, COALESCE(last_used_at, 0) DESC, name`,
  );
  return rows.map(mapPlace);
}

export async function getLocalPlace(
  db: SQLiteDatabase,
  placeId: string,
): Promise<LocalPlace | null> {
  const row = await db.getFirstAsync<PlaceRow>(
    `SELECT id, remote_id, name, starred, archived, last_used_at, updated_at
       FROM local_places
      WHERE (id = ? OR remote_id = ?) AND archived = 0
      LIMIT 1`,
    placeId,
    placeId,
  );
  return row ? mapPlace(row) : null;
}

export async function findStarredLocalPlace(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<PlaceRow>(
    `SELECT id, remote_id, name, starred, archived, last_used_at, updated_at
       FROM local_places
      WHERE starred = 1 AND archived = 0
      LIMIT 1`,
  );
  return row ? mapPlace(row) : null;
}

/** Idempotent starred Home, matching the server `ensureHomePlace`. */
export async function ensureLocalHomePlace(
  db: SQLiteDatabase,
): Promise<LocalPlace> {
  const starred = await findStarredLocalPlace(db);
  if (starred) return starred;

  const namedHome = await db.getFirstAsync<PlaceRow>(
    `SELECT id, remote_id, name, starred, archived, last_used_at, updated_at
       FROM local_places
      WHERE archived = 0 AND lower(name) = 'home'
      LIMIT 1`,
  );
  if (namedHome) {
    await db.runAsync(
      "UPDATE local_places SET starred = CASE WHEN id = ? THEN 1 ELSE 0 END",
      namedHome.id,
    );
    return { ...mapPlace(namedHome), starred: true };
  }

  const now = Date.now();
  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO local_places (
       id, remote_id, name, starred, archived, last_used_at, updated_at
     ) VALUES (?, NULL, ?, 1, 0, NULL, ?)`,
    id,
    HOME_PLACE_NAME,
    now,
  );
  return {
    _id: id,
    remoteId: null,
    name: HOME_PLACE_NAME,
    starred: true,
    archived: false,
    lastUsedAt: null,
    updatedAt: now,
  };
}

export async function resolveLocalPlaceForStart(
  db: SQLiteDatabase,
  {
    placeId,
    templateLastPlaceId,
    blank,
  }: {
    placeId?: string | null;
    templateLastPlaceId?: string | null;
    blank?: boolean;
  },
): Promise<LocalPlace> {
  const home = await ensureLocalHomePlace(db);
  if (placeId) {
    const chosen = await getLocalPlace(db, placeId);
    if (chosen) return chosen;
  }
  if (!blank && templateLastPlaceId) {
    const last = await getLocalPlace(db, templateLastPlaceId);
    if (last) return last;
  }
  if (blank) {
    const lastPlaceId = await getLastLocalSessionPlaceId(db);
    if (lastPlaceId) {
      const last = await getLocalPlace(db, lastPlaceId);
      if (last) return last;
    }
  }
  return home;
}

export async function getLastLocalSessionPlaceId(
  db: SQLiteDatabase,
): Promise<string | null> {
  const lastSession = await db.getFirstAsync<{
    place_id: string | null;
  }>(
    `SELECT place_id FROM local_sessions
      WHERE status = 'completed'
        AND (session_kind IS NULL OR session_kind != 'health_summary')
      ORDER BY COALESCE(completed_at, started_at) DESC
      LIMIT 1`,
  );
  return lastSession?.place_id ?? null;
}

export async function listLocalMachinesForLift(
  db: SQLiteDatabase,
  placeId: string,
  exerciseSlug: string,
): Promise<LocalMachine[]> {
  const rows = await db.getAllAsync<MachineRow>(
    `SELECT id, remote_id, name, place_id, exercise_slug, is_default,
            archived, last_used_at, updated_at
       FROM local_machines
      WHERE place_id = ? AND exercise_slug = ? AND archived = 0
      ORDER BY is_default DESC, COALESCE(last_used_at, 0) DESC, name`,
    placeId,
    exerciseSlug,
  );
  return rows.map(mapMachine);
}

export async function lastLocalMachineForLift(
  db: SQLiteDatabase,
  placeId: string,
  exerciseSlug: string,
): Promise<LocalMachine | null> {
  const machines = await listLocalMachinesForLift(db, placeId, exerciseSlug);
  if (machines.length === 0) return null;
  return (
    machines.find((machine) => machine.lastUsedAt) ??
    machines.find((machine) => machine.isDefault) ??
    machines[0] ??
    null
  );
}

export async function getLocalWorkingSets(
  db: SQLiteDatabase,
  {
    placeId,
    exerciseSlug,
    machineId,
  }: {
    placeId: string;
    exerciseSlug: string;
    machineId?: string | null;
  },
): Promise<MemorySet[] | null> {
  const key = machineId ?? DEFAULT_MACHINE_KEY;
  const row = await db.getFirstAsync<{ sets_json: string }>(
    `SELECT sets_json FROM local_exercise_place_weights
      WHERE place_id = ? AND exercise_slug = ? AND machine_key = ?`,
    placeId,
    exerciseSlug,
    key,
  );
  if (row) {
    try {
      const parsed = JSON.parse(row.sets_json) as MemorySet[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      return null;
    }
  }
  if (!machineId) return null;
  const machine = await db.getFirstAsync<{ is_default: number }>(
    "SELECT is_default FROM local_machines WHERE id = ?",
    machineId,
  );
  if (machine?.is_default !== 1) return null;
  const implicit = await db.getFirstAsync<{ sets_json: string }>(
    `SELECT sets_json FROM local_exercise_place_weights
      WHERE place_id = ? AND exercise_slug = ? AND machine_key = ?`,
    placeId,
    exerciseSlug,
    DEFAULT_MACHINE_KEY,
  );
  if (!implicit) return null;
  try {
    const parsed = JSON.parse(implicit.sets_json) as MemorySet[];
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export function seedLocalSetRows(
  templateSets: MemorySet[],
  memorySets: MemorySet[] | null,
) {
  return seedSetRows(templateSets, memorySets);
}

export async function upsertLocalPlace(
  db: SQLiteDatabase,
  place: {
    id: string;
    remoteId: string | null;
    name: string;
    starred: boolean;
    archived?: boolean;
    lastUsedAt?: number | null;
  },
) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO local_places (
       id, remote_id, name, starred, archived, last_used_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       remote_id = COALESCE(excluded.remote_id, local_places.remote_id),
       name = excluded.name,
       starred = excluded.starred,
       archived = excluded.archived,
       last_used_at = excluded.last_used_at,
       updated_at = excluded.updated_at`,
    place.id,
    place.remoteId,
    place.name,
    place.starred ? 1 : 0,
    place.archived ? 1 : 0,
    place.lastUsedAt ?? null,
    now,
  );
}

export async function starLocalPlace(db: SQLiteDatabase, id: string) {
  const now = Date.now();
  await db.runAsync(
    `UPDATE local_places SET starred = 0, updated_at = ? WHERE starred = 1`,
    now,
  );
  await db.runAsync(
    `UPDATE local_places SET starred = 1, updated_at = ? WHERE id = ? OR remote_id = ?`,
    now,
    id,
    id,
  );
}

export async function archiveLocalPlace(db: SQLiteDatabase, id: string) {
  await db.runAsync(
    `UPDATE local_places
        SET archived = 1, starred = 0, updated_at = ?
      WHERE id = ? OR remote_id = ?`,
    Date.now(),
    id,
    id,
  );
}

export async function upsertLocalMachine(
  db: SQLiteDatabase,
  machine: {
    id: string;
    remoteId: string | null;
    placeId: string;
    exerciseSlug: string;
    name: string;
    isDefault: boolean;
    lastUsedAt?: number | null;
  },
) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO local_machines (
       id, remote_id, place_id, exercise_slug, name, is_default, archived,
       last_used_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       remote_id = COALESCE(excluded.remote_id, local_machines.remote_id),
       name = excluded.name,
       is_default = excluded.is_default,
       last_used_at = excluded.last_used_at,
       updated_at = excluded.updated_at`,
    machine.id,
    machine.remoteId,
    machine.placeId,
    machine.exerciseSlug,
    machine.name,
    machine.isDefault ? 1 : 0,
    machine.lastUsedAt ?? null,
    now,
  );
}

export async function reseedLocalSessionToPlace(
  db: SQLiteDatabase,
  sessionId: string,
  placeId: string,
): Promise<{ hadCompletedSets: boolean; reseeded: number }> {
  const place = await getLocalPlace(db, placeId);
  if (!place) throw new Error("Place not found");

  await db.runAsync(
    `UPDATE local_sessions SET place_id = ?, place_name = ? WHERE id = ?`,
    place._id,
    place.name,
    sessionId,
  );

  const exercises = await db.getAllAsync<{
    id: string;
    slug: string;
  }>(
    `SELECT id, slug FROM local_session_exercises
      WHERE session_id = ? ORDER BY order_index`,
    sessionId,
  );

  let hadCompletedSets = false;
  let reseeded = 0;

  for (const exercise of exercises) {
    const machine = await lastLocalMachineForLift(db, place._id, exercise.slug);
    await db.runAsync(
      `UPDATE local_session_exercises
          SET machine_id = ?, machine_name = ?
        WHERE id = ?`,
      machine?._id ?? null,
      machine?.name ?? null,
      exercise.id,
    );
    const sets = await db.getAllAsync<{
      id: string;
      completed: number;
      weight: number;
      reps: number;
    }>(
      `SELECT id, completed, weight, reps FROM local_sets
        WHERE session_exercise_id = ? ORDER BY order_index`,
      exercise.id,
    );
    if (sets.some((set) => set.completed === 1)) hadCompletedSets = true;
    const memory = await getLocalWorkingSets(db, {
      placeId: place._id,
      exerciseSlug: exercise.slug,
      machineId: machine?._id,
    });
    const next = reseedIncompleteSets(
      sets.map((set) => ({
        completed: set.completed === 1,
        weight: set.weight,
        reps: set.reps,
      })),
      memory,
    );
    for (let i = 0; i < sets.length; i++) {
      const current = sets[i];
      const updated = next[i];
      if (!current || !updated) continue;
      if (current.weight === updated.weight && current.reps === updated.reps) {
        continue;
      }
      await db.runAsync(
        `UPDATE local_sets
            SET weight = ?, reps = ?, target_weight = ?, target_reps = ?
          WHERE id = ?`,
        updated.weight,
        updated.reps,
        updated.weight,
        updated.reps,
        current.id,
      );
      if (current.completed === 0) reseeded += 1;
    }
  }

  return { hadCompletedSets, reseeded };
}

export async function assignLocalSessionMachine(
  db: SQLiteDatabase,
  sessionExerciseId: string,
  machineId: string,
) {
  const exercise = await db.getFirstAsync<{
    id: string;
    slug: string;
    session_id: string;
  }>(
    `SELECT id, slug, session_id FROM local_session_exercises WHERE id = ?`,
    sessionExerciseId,
  );
  if (!exercise) throw new Error("Exercise not found");
  const session = await db.getFirstAsync<{
    place_id: string | null;
    status: string;
  }>(
    `SELECT place_id, status FROM local_sessions WHERE id = ?`,
    exercise.session_id,
  );
  if (!session || session.status !== "in_progress") {
    throw new Error("Workout is no longer active");
  }
  if (!session.place_id) throw new Error("Pick a place first");
  const machine = await db.getFirstAsync<MachineRow>(
    `SELECT id, remote_id, name, place_id, exercise_slug, is_default,
            archived, last_used_at, updated_at
       FROM local_machines WHERE id = ? OR remote_id = ?`,
    machineId,
    machineId,
  );
  if (
    !machine ||
    machine.archived === 1 ||
    machine.place_id !== session.place_id ||
    machine.exercise_slug !== exercise.slug
  ) {
    throw new Error("Machine not found");
  }
  await db.runAsync(
    `UPDATE local_session_exercises
        SET machine_id = ?, machine_name = ?
      WHERE id = ?`,
    machine.id,
    machine.name,
    exercise.id,
  );
  const sets = await db.getAllAsync<{
    id: string;
    completed: number;
    weight: number;
    reps: number;
  }>(
    `SELECT id, completed, weight, reps FROM local_sets
      WHERE session_exercise_id = ? ORDER BY order_index`,
    exercise.id,
  );
  const memory = await getLocalWorkingSets(db, {
    placeId: session.place_id,
    exerciseSlug: exercise.slug,
    machineId: machine.id,
  });
  const next = reseedIncompleteSets(
    sets.map((set) => ({
      completed: set.completed === 1,
      weight: set.weight,
      reps: set.reps,
    })),
    memory,
  );
  for (let i = 0; i < sets.length; i++) {
    const current = sets[i];
    const updated = next[i];
    if (!current || !updated) continue;
    if (current.weight === updated.weight && current.reps === updated.reps) {
      continue;
    }
    await db.runAsync(
      `UPDATE local_sets
          SET weight = ?, reps = ?, target_weight = ?, target_reps = ?
        WHERE id = ?`,
      updated.weight,
      updated.reps,
      updated.weight,
      updated.reps,
      current.id,
    );
  }
}

export async function recordLocalSessionPlaceMemory(
  db: SQLiteDatabase,
  sessionId: string,
) {
  const session = await db.getFirstAsync<{
    id: string;
    status: string;
    session_kind: string | null;
    template_id: string | null;
    place_id: string | null;
    place_name: string | null;
  }>(
    `SELECT id, status, session_kind, template_id, place_id, place_name
       FROM local_sessions WHERE id = ?`,
    sessionId,
  );
  if (!session || session.status !== "completed") return;
  if (session.session_kind === "health_summary") return;

  const place =
    (session.place_id ? await getLocalPlace(db, session.place_id) : null) ??
    (await findStarredLocalPlace(db));
  if (!place) return;

  const now = Date.now();
  if (session.place_id !== place._id || session.place_name !== place.name) {
    await db.runAsync(
      `UPDATE local_sessions SET place_id = ?, place_name = ? WHERE id = ?`,
      place._id,
      place.name,
      sessionId,
    );
  }
  await db.runAsync(
    `UPDATE local_places SET last_used_at = ?, updated_at = ? WHERE id = ?`,
    now,
    now,
    place._id,
  );
  if (session.template_id) {
    await db.runAsync(
      `UPDATE local_templates SET last_place_id = ? WHERE id = ?`,
      place._id,
      session.template_id,
    );
  }

  const exercises = await db.getAllAsync<{
    id: string;
    slug: string;
    machine_id: string | null;
  }>(
    `SELECT id, slug, machine_id FROM local_session_exercises
      WHERE session_id = ? ORDER BY order_index`,
    sessionId,
  );
  for (const exercise of exercises) {
    const sets = await db.getAllAsync<{ weight: number; reps: number }>(
      `SELECT weight, reps FROM local_sets
        WHERE session_exercise_id = ? ORDER BY order_index`,
      exercise.id,
    );
    if (sets.length === 0) continue;
    if (exercise.machine_id) {
      await db.runAsync(
        `UPDATE local_machines SET last_used_at = ?, updated_at = ? WHERE id = ?`,
        now,
        now,
        exercise.machine_id,
      );
    }
    const machineKey = exercise.machine_id ?? DEFAULT_MACHINE_KEY;
    await db.runAsync(
      `INSERT INTO local_exercise_place_weights (
         place_id, exercise_slug, machine_key, sets_json, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(place_id, exercise_slug, machine_key) DO UPDATE SET
         sets_json = excluded.sets_json,
         updated_at = excluded.updated_at`,
      place._id,
      exercise.slug,
      machineKey,
      JSON.stringify(sets),
      now,
    );
  }
}

/**
 * Merge server places/machines/weights. Newer local finish times win so a
 * workout completed on the phone isn't overwritten by a stale bootstrap.
 */
export async function applyPlacesBootstrap(
  txn: SQLiteDatabase,
  payload: IosBootstrapPayload,
) {
  const places = payload.places ?? [];
  const machines = payload.machines ?? [];
  const placeWeights = payload.placeWeights ?? [];
  const remoteToLocal = new Map<string, string>();

  for (const place of places) {
    const existing =
      (place.clientId
        ? await txn.getFirstAsync<{ id: string }>(
            "SELECT id FROM local_places WHERE id = ?",
            place.clientId,
          )
        : null) ??
      (await txn.getFirstAsync<{ id: string }>(
        "SELECT id FROM local_places WHERE remote_id = ?",
        place.remoteId,
      )) ??
      (place.name.toLowerCase() === "home"
        ? await txn.getFirstAsync<{ id: string }>(
            `SELECT id FROM local_places
              WHERE lower(name) = 'home' AND archived = 0
              LIMIT 1`,
          )
        : null);
    const localId = existing?.id ?? place.remoteId;
    remoteToLocal.set(place.remoteId, localId);
    await txn.runAsync(
      `INSERT INTO local_places (
         id, remote_id, name, starred, archived, last_used_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         remote_id = excluded.remote_id,
         name = excluded.name,
         starred = excluded.starred,
         archived = excluded.archived,
         last_used_at = excluded.last_used_at,
         updated_at = excluded.updated_at`,
      localId,
      place.remoteId,
      place.name,
      place.starred ? 1 : 0,
      place.archived ? 1 : 0,
      place.lastUsedAt,
      payload.serverTime,
    );
  }

  for (const machine of machines) {
    const localPlaceId = remoteToLocal.get(machine.placeId) ?? machine.placeId;
    const placeExists = await txn.getFirstAsync<{ id: string }>(
      "SELECT id FROM local_places WHERE id = ?",
      localPlaceId,
    );
    if (!placeExists) continue;
    const existing =
      (machine.clientId
        ? await txn.getFirstAsync<{ id: string }>(
            "SELECT id FROM local_machines WHERE id = ?",
            machine.clientId,
          )
        : null) ??
      (await txn.getFirstAsync<{ id: string }>(
        "SELECT id FROM local_machines WHERE remote_id = ?",
        machine.remoteId,
      ));
    const localId = existing?.id ?? machine.remoteId;
    await txn.runAsync(
      `INSERT INTO local_machines (
         id, remote_id, place_id, exercise_slug, name, is_default, archived,
         last_used_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         remote_id = excluded.remote_id,
         place_id = excluded.place_id,
         name = excluded.name,
         is_default = excluded.is_default,
         archived = excluded.archived,
         last_used_at = excluded.last_used_at,
         updated_at = excluded.updated_at`,
      localId,
      machine.remoteId,
      localPlaceId,
      machine.exerciseSlug,
      machine.name,
      machine.isDefault ? 1 : 0,
      machine.archived ? 1 : 0,
      machine.lastUsedAt,
      payload.serverTime,
    );
  }

  for (const weight of placeWeights) {
    const localPlaceId = remoteToLocal.get(weight.placeId) ?? weight.placeId;
    const placeExists = await txn.getFirstAsync<{ id: string }>(
      "SELECT id FROM local_places WHERE id = ?",
      localPlaceId,
    );
    if (!placeExists) continue;
    await txn.runAsync(
      `INSERT INTO local_exercise_place_weights (
         place_id, exercise_slug, machine_key, sets_json, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(place_id, exercise_slug, machine_key) DO UPDATE SET
         sets_json = excluded.sets_json,
         updated_at = excluded.updated_at
       WHERE local_exercise_place_weights.updated_at <= excluded.updated_at`,
      localPlaceId,
      weight.exerciseSlug,
      weight.machineKey,
      JSON.stringify(weight.sets),
      weight.updatedAt,
    );
  }

  await ensureLocalHomePlace(txn);
}

export function convexPlaceId(place: LocalPlace | null | undefined) {
  return place?.remoteId ?? null;
}

export function convexMachineId(
  machine: {
    remoteId: string | null;
    _id: string;
  } | null,
) {
  return machine?.remoteId ?? null;
}

export { MAX_MACHINES_PER_LIFT };
