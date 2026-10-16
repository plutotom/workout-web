import type { SQLiteDatabase } from "expo-sqlite";

async function moveMemories(
  db: SQLiteDatabase,
  field: "place_id" | "machine_key",
  from: string,
  to: string,
) {
  // Identifiers are a fixed union, values are always bound parameters.
  const rows = await db.getAllAsync<{
    place_id: string;
    exercise_slug: string;
    machine_key: string;
    sets_json: string;
    updated_at: number;
  }>(`SELECT * FROM local_exercise_place_weights WHERE ${field} = ?`, from);
  for (const row of rows) {
    await db.runAsync(
      `INSERT INTO local_exercise_place_weights (place_id, exercise_slug, machine_key, sets_json, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(place_id, exercise_slug, machine_key) DO UPDATE SET
      sets_json = CASE WHEN excluded.updated_at > updated_at THEN excluded.sets_json ELSE sets_json END,
      updated_at = MAX(updated_at, excluded.updated_at)`,
      field === "place_id" ? to : row.place_id,
      row.exercise_slug,
      field === "machine_key" ? to : row.machine_key,
      row.sets_json,
      row.updated_at,
    );
  }
  await db.runAsync(
    `DELETE FROM local_exercise_place_weights WHERE ${field} = ?`,
    from,
  );
}

async function moveQueuedIdentity(
  db: SQLiteDatabase,
  type: "place" | "machine",
  from: string,
  to: string,
) {
  const alias = await db.getFirstAsync<{
    payload_json: string;
    operation_id: string;
    created_at: number;
  }>(
    "SELECT payload_json, operation_id, created_at FROM local_sync_outbox WHERE entity_type = ? AND entity_id = ?",
    type,
    from,
  );
  if (!alias) return;
  const original = await db.getFirstAsync<{ created_at: number }>(
    "SELECT created_at FROM local_sync_outbox WHERE entity_type = ? AND entity_id = ?",
    type,
    to,
  );
  if (original && original.created_at > alias.created_at) {
    // Retain an unusual competing local edit for recovery instead of erasing it.
    await db.runAsync(
      "INSERT OR IGNORE INTO local_metadata (key, value) VALUES (?, ?)",
      `recovery:identity:${alias.operation_id}`,
      alias.payload_json,
    );
    await db.runAsync(
      "DELETE FROM local_sync_outbox WHERE operation_id = ?",
      alias.operation_id,
    );
    return;
  }
  await db.runAsync(
    "DELETE FROM local_sync_outbox WHERE entity_type = ? AND entity_id = ?",
    type,
    to,
  );
  const payload = JSON.parse(alias.payload_json);
  await db.runAsync(
    "UPDATE local_sync_outbox SET entity_id = ?, payload_json = ? WHERE operation_id = ?",
    to,
    JSON.stringify({ ...payload, clientId: to }),
    alias.operation_id,
  );
}

/** Inside a transaction. Keep the original phone id and merge a cloud echo. */
export async function adoptPlaceIdentity(
  db: SQLiteDatabase,
  id: string,
  remoteId: string,
) {
  const alias = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM local_places WHERE remote_id = ? AND id != ?",
    remoteId,
    id,
  );
  if (alias) {
    await db.runAsync(
      "UPDATE local_sessions SET place_id = ? WHERE place_id = ?",
      id,
      alias.id,
    );
    await db.runAsync(
      "UPDATE local_templates SET last_place_id = ? WHERE last_place_id = ?",
      id,
      alias.id,
    );
    await db.runAsync(
      "UPDATE local_machines SET place_id = ? WHERE place_id = ?",
      id,
      alias.id,
    );
    await moveMemories(db, "place_id", alias.id, id);
    await moveQueuedIdentity(db, "place", alias.id, id);
    await db.runAsync("DELETE FROM local_places WHERE id = ?", alias.id);
  }
  await db.runAsync(
    "UPDATE local_places SET remote_id = ? WHERE id = ?",
    remoteId,
    id,
  );
}

export async function adoptMachineIdentity(
  db: SQLiteDatabase,
  id: string,
  remoteId: string,
) {
  const alias = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM local_machines WHERE remote_id = ? AND id != ?",
    remoteId,
    id,
  );
  if (alias) {
    await db.runAsync(
      "UPDATE local_session_exercises SET machine_id = ? WHERE machine_id = ?",
      id,
      alias.id,
    );
    await moveMemories(db, "machine_key", alias.id, id);
    await moveQueuedIdentity(db, "machine", alias.id, id);
    await db.runAsync("DELETE FROM local_machines WHERE id = ?", alias.id);
  }
  await db.runAsync(
    "UPDATE local_machines SET remote_id = ? WHERE id = ?",
    remoteId,
    id,
  );
}
