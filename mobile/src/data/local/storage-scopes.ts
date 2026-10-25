import { randomUUID } from "expo-crypto";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { migrateLocalDatabase } from "./migrations";
import { keepNoteAlternative } from "./note-recovery";
import { refreshQueuedSessionSnapshot } from "./repository";
import { convexWorkoutTemplateId } from "./types";
import {
  GENERAL_PREFS_ECHO_PENDING_KEY,
  GENERAL_PREFS_OPERATION_KEY,
  parseEchoPendingPatch,
} from "./preferences";

export const LEGACY_DATABASE = "workout-local-v1.db";
export const GUEST_DATABASE = "workout-guest-v2.db";
const OWNER = "storage:owner";
const CLAIM = "storage:transfer";
const GUEST = "guest";
// Parents precede children. Only these fixed identifiers enter SQL strings.
const TABLES = [
  "local_custom_exercises",
  "local_places",
  "local_machines",
  "local_templates",
  "local_template_exercises",
  "local_exercise_notes",
  "local_sessions",
  "local_session_exercises",
  "local_sets",
  "local_exercise_place_weights",
  "local_health_ignored",
  "local_health_state",
] as const;
type Row = Record<string, string | number | null>;
type Snapshot = {
  tables: Record<string, Row[]>;
  preferences: Row;
  outbox: Row[];
  metadata: Row[];
};
type Transfer = {
  id: string;
  owner: string;
  guest: boolean;
  snapshot: Snapshot;
};
let preparation: Promise<unknown> = Promise.resolve();
const writes = new Map<string, Set<Promise<unknown>>>();

export function accountDatabaseName(owner: string | null) {
  return owner
    ? `workout-account-${encodeURIComponent(owner)}.db`
    : GUEST_DATABASE;
}

export async function trackLocalWrite<T>(
  name: string,
  operation: () => Promise<T>,
) {
  const pending = writes.get(name) ?? new Set();
  writes.set(name, pending);
  const work = operation();
  pending.add(work);
  try {
    return await work;
  } finally {
    pending.delete(work);
  }
}

async function metadata(db: SQLiteDatabase, key: string) {
  return (
    await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM local_metadata WHERE key = ?",
      key,
    )
  )?.value;
}
async function put(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    "INSERT INTO local_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}
async function stampOwner(db: SQLiteDatabase, owner: string | null) {
  const expected = owner ? `account:${owner}` : GUEST;
  const existing = await metadata(db, OWNER);
  if (existing && existing !== expected)
    throw new Error("This database belongs to another account");
  await put(db, OWNER, expected);
}

export async function databaseBelongsTo(db: SQLiteDatabase, owner: string) {
  return (await metadata(db, OWNER)) === `account:${owner}`;
}

export async function transferredGuestWorkoutIds(
  db: SQLiteDatabase,
  owner: string | null,
): Promise<string[]> {
  if (!owner || !(await databaseBelongsTo(db, owner))) return [];
  const receipts = await db.getAllAsync<{ value: string }>(
    "SELECT value FROM local_metadata WHERE key LIKE 'recovery:transfer:%'",
  );
  return receipts.flatMap(({ value }) => {
    const transfer = JSON.parse(value) as Transfer;
    return transfer.guest && transfer.owner === owner
      ? transfer.snapshot.tables.local_sessions.map((row) => String(row.id))
      : [];
  });
}

async function snapshot(db: SQLiteDatabase): Promise<Snapshot> {
  const tables: Snapshot["tables"] = {};
  for (const table of TABLES)
    tables[table] = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
  return {
    tables,
    preferences: (await db.getFirstAsync<Row>(
      "SELECT * FROM local_preferences WHERE id = 1",
    ))!,
    outbox: await db.getAllAsync<Row>("SELECT * FROM local_sync_outbox"),
    metadata: await db.getAllAsync<Row>(
      "SELECT * FROM local_metadata WHERE key NOT LIKE 'storage:%' AND key NOT LIKE 'recovery:%'",
    ),
  };
}

async function insertRow(
  db: SQLiteDatabase,
  table: (typeof TABLES)[number] | "local_sync_outbox",
  row: Row,
  replace = false,
) {
  // Columns originate in this app's SQLite schema, never a supplied backup file.
  const columns = Object.keys(row);
  if (columns.some((key) => !/^[a-z_]+$/.test(key)))
    throw new Error("Invalid stored column");
  return db.runAsync(
    `INSERT OR ${replace ? "REPLACE" : "IGNORE"} INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
    ...Object.values(row),
  );
}

async function importTransfer(db: SQLiteDatabase, transfer: Transfer) {
  const done = `storage:imported:${transfer.id}`;
  if (await metadata(db, done)) return;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await stampOwner(txn, transfer.owner);
    // Immutable recovery copy commits with the imported rows, before source
    // cleanup. A crash can replay the same transfer without minting new ids.
    await put(
      txn,
      `recovery:transfer:${transfer.id}`,
      JSON.stringify(transfer),
    );
    const before = await txn.getFirstAsync<{ unit: "lb" | "kg" }>(
      "SELECT unit FROM local_preferences WHERE id = 1",
    );
    const hasAccountState =
      Boolean(await metadata(txn, "last_bootstrap_at")) ||
      Boolean(
        await txn.getFirstAsync(
          "SELECT id FROM local_sessions UNION ALL SELECT id FROM local_templates LIMIT 1",
        ),
      );
    const sourceUnit =
      transfer.snapshot.preferences.unit === "kg" ? "kg" : "lb";
    const added = new Map<string, Set<string>>();
    const acceptedNotes = new Set<string>();
    const aliases = new Map<string, Map<string, string>>();
    const slugs = new Map<string, string>();
    const foreignKeys: Record<string, Record<string, string>> = {
      local_machines: { place_id: "local_places" },
      local_templates: { last_place_id: "local_places" },
      local_template_exercises: { template_id: "local_templates" },
      local_sessions: {
        template_id: "local_templates",
        place_id: "local_places",
      },
      local_session_exercises: {
        session_id: "local_sessions",
        machine_id: "local_machines",
      },
      local_sets: { session_exercise_id: "local_session_exercises" },
      local_exercise_place_weights: {
        place_id: "local_places",
        machine_key: "local_machines",
      },
    };
    for (const table of TABLES) {
      const ids = new Set<string>();
      added.set(table, ids);
      const identityMap = new Map<string, string>();
      aliases.set(table, identityMap);
      for (const original of transfer.snapshot.tables[table]) {
        const source = { ...original };
        if (typeof source.id === "string" && "remote_id" in source) {
          const existing = await txn.getFirstAsync<{
            id: string;
            slug?: string;
          }>(
            `SELECT * FROM ${table} WHERE id = ? OR remote_id = ? LIMIT 1`,
            source.id,
            source.remote_id,
          );
          if (existing) {
            identityMap.set(source.id, existing.id);
            if (table === "local_custom_exercises" && existing.slug)
              slugs.set(String(source.slug), existing.slug);
            continue;
          }
        }
        for (const column of ["slug", "exercise_slug"])
          if (typeof source[column] === "string")
            source[column] = slugs.get(source[column]) ?? source[column];
        for (const [column, parent] of Object.entries(
          foreignKeys[table] ?? {},
        )) {
          const id = source[column];
          if (typeof id === "string")
            source[column] = aliases.get(parent)?.get(id) ?? id;
        }
        if (
          table === "local_sessions" &&
          typeof source.template_id === "string"
        ) {
          const template = await txn.getFirstAsync<{ remote_id: string }>(
            "SELECT remote_id FROM local_templates WHERE id = ?",
            source.template_id,
          );
          // Reusing a destination template will not produce a template ACK
          // later, so imported children must adopt its trusted identity now.
          if (template)
            source.remote_template_id = convexWorkoutTemplateId(
              template.remote_id,
            );
        }
        // Existing aggregates win on restore. Their alternative source graph
        // remains in the immutable recovery copy, rather than mixing children.
        const parent =
          table === "local_template_exercises"
            ? "local_templates"
            : table === "local_session_exercises"
              ? "local_sessions"
              : table === "local_sets"
                ? "local_session_exercises"
                : null;
        const parentColumn =
          table === "local_template_exercises"
            ? "template_id"
            : table === "local_session_exercises"
              ? "session_id"
              : "session_exercise_id";
        if (parent && !added.get(parent)?.has(String(source[parentColumn])))
          continue;
        if (table === "local_exercise_notes") {
          const existing = await txn.getFirstAsync<{ notes: string }>(
            "SELECT notes FROM local_exercise_notes WHERE slug = ?",
            source.slug,
          );
          if (!existing || transfer.guest || existing.notes === source.notes)
            acceptedNotes.add(String(source.slug));
          if (existing && existing.notes !== source.notes) {
            await keepNoteAlternative(
              txn,
              String(source.slug),
              transfer.guest ? existing.notes : String(source.notes),
            );
          }
          if (existing && transfer.guest)
            await txn.runAsync(
              "UPDATE local_exercise_notes SET notes = ?, updated_at = ? WHERE slug = ?",
              source.notes,
              source.updated_at,
              source.slug,
            );
        }
        const result = await insertRow(txn, table, source);
        if (result.changes)
          ids.add(
            typeof source.id === "string"
              ? source.id
              : JSON.stringify([
                  source.place_id,
                  source.exercise_slug,
                  source.machine_key,
                ]),
          );
      }
    }
    // A new account partition starts in the guest's source unit. Bootstrap
    // converts the local copy into the account unit before allowing uploads.
    if (!hasAccountState) {
      for (const [column, value] of Object.entries(
        transfer.snapshot.preferences,
      )) {
        if (column !== "id" && /^[a-z_]+$/.test(column))
          await txn.runAsync(
            `UPDATE local_preferences SET ${column} = ? WHERE id = 1`,
            value,
          );
      }
    }
    for (const row of transfer.snapshot.metadata) {
      if (
        typeof row.key === "string" &&
        row.key.startsWith("note:alternatives:") &&
        typeof row.value === "string"
      ) {
        const sourceSlug = row.key.slice("note:alternatives:".length);
        const slug = slugs.get(sourceSlug) ?? sourceSlug;
        for (const version of JSON.parse(row.value) as Array<{ notes: string }>)
          await keepNoteAlternative(txn, slug, version.notes);
        continue;
      }
      // Server revisions are account-specific, and guest text has no common
      // baseline with the destination. Keep the destination's own sync history.
      if (
        transfer.guest &&
        typeof row.key === "string" &&
        (row.key.startsWith("note:revision:") ||
          row.key.startsWith("note:baseline:"))
      )
        continue;
      if (
        typeof row.key === "string" &&
        row.key !== GENERAL_PREFS_ECHO_PENDING_KEY &&
        row.key !== GENERAL_PREFS_OPERATION_KEY
      )
        await txn.runAsync(
          "INSERT OR IGNORE INTO local_metadata (key, value) VALUES (?, ?)",
          row.key,
          row.value,
        );
    }
    const entityTables: Record<string, string> = {
      session: "local_sessions",
      session_delete: "local_sessions",
      template: "local_templates",
      template_quarantined: "local_templates",
      custom_exercise: "local_custom_exercises",
      place: "local_places",
      machine: "local_machines",
    };
    for (const original of transfer.snapshot.outbox) {
      const row = { ...original };
      if (typeof row.entity_id === "string")
        row.entity_id = slugs.get(row.entity_id) ?? row.entity_id;
      if (typeof row.payload_json === "string")
        row.payload_json = JSON.stringify(
          JSON.parse(row.payload_json, (key, value) =>
            (key === "slug" || key === "exerciseSlug") &&
            typeof value === "string"
              ? (slugs.get(value) ?? value)
              : value,
          ),
        );
      if (row.entity_type === "preferences") continue;
      if (
        (row.entity_type === "exercise_note" ||
          row.entity_type === "exercise_note_rejected") &&
        !acceptedNotes.has(String(row.entity_id))
      )
        continue;
      const table = entityTables[String(row.entity_type)];
      if (
        table &&
        row.entity_type !== "session_delete" &&
        !added.get(table)?.has(String(row.entity_id))
      )
        continue;
      if (
        transfer.guest &&
        (row.entity_type === "exercise_note" ||
          row.entity_type === "exercise_note_rejected")
      )
        await txn.runAsync(
          "DELETE FROM local_sync_outbox WHERE entity_type IN ('exercise_note', 'exercise_note_rejected') AND entity_id = ?",
          row.entity_id,
        );
      await insertRow(
        txn,
        "local_sync_outbox",
        row,
        transfer.guest &&
          (row.entity_type === "exercise_note" ||
            row.entity_type === "exercise_note_rejected"),
      );
    }
    const preferenceRow = transfer.snapshot.outbox.find(
      (row) => row.entity_type === "preferences",
    );
    if (preferenceRow && typeof preferenceRow.payload_json === "string") {
      const patch = parseEchoPendingPatch(preferenceRow.payload_json) ?? {};
      if (transfer.guest) delete patch.unit;
      const current = await txn.getFirstAsync<{ payload_json: string }>(
        "SELECT payload_json FROM local_sync_outbox WHERE entity_type = 'preferences'",
      );
      const merged = {
        ...(current ? JSON.parse(current.payload_json) : {}),
        ...patch,
      };
      if (Object.keys(merged).length) {
        await insertRow(
          txn,
          "local_sync_outbox",
          { ...preferenceRow, payload_json: JSON.stringify(merged) },
          true,
        );
        await put(txn, GENERAL_PREFS_ECHO_PENDING_KEY, JSON.stringify(merged));
        await put(
          txn,
          GENERAL_PREFS_OPERATION_KEY,
          String(preferenceRow.operation_id),
        );
        const fields: Record<string, string> = {
          unit: "unit",
          barWeightLb: "bar_weight_lb",
          barWeightKg: "bar_weight_kg",
          activeWorkoutMode: "active_workout_mode",
          restTimerEnabled: "rest_timer_enabled",
        };
        for (const [key, value] of Object.entries(merged))
          if (key in fields)
            await txn.runAsync(
              `UPDATE local_preferences SET ${fields[key]} = ? WHERE id = 1`,
              typeof value === "boolean"
                ? Number(value)
                : (value as string | number),
            );
      }
    }
    if (
      transfer.guest &&
      hasAccountState &&
      before &&
      before.unit !== sourceUnit
    ) {
      // Existing account rows must not be reinterpreted in the guest unit.
      // Convert only newly imported prescriptions using their immutable source.
      await convertImportedWeights(txn, transfer, added, before.unit);
      await txn.runAsync(
        "UPDATE local_preferences SET unit = ? WHERE id = 1",
        before.unit,
      );
    }
    // Rebuild from the remapped rows after unit conversion. The transfer and
    // its upload intent commit together, preserving operation ids on retry.
    for (const sessionId of added.get("local_sessions") ?? [])
      await refreshQueuedSessionSnapshot(txn, sessionId);
    await put(txn, done, "1");
  });
}

async function convertImportedWeights(
  db: SQLiteDatabase,
  transfer: Transfer,
  added: Map<string, Set<string>>,
  unit: "lb" | "kg",
) {
  const { convertWeight } = await import("@shared/workout-export");
  const { convertPrescriptionJson } = await import("./weight-units");
  const from = transfer.snapshot.preferences.unit === "kg" ? "kg" : "lb";
  for (const row of transfer.snapshot.tables.local_sets)
    if (added.get("local_sets")?.has(String(row.id)))
      await db.runAsync(
        "UPDATE local_sets SET weight = ?, target_weight = ? WHERE id = ?",
        convertWeight(Number(row.weight), from, unit),
        convertWeight(Number(row.target_weight), from, unit),
        row.id,
      );
  for (const row of transfer.snapshot.tables.local_template_exercises)
    if (added.get("local_template_exercises")?.has(String(row.id)))
      await db.runAsync(
        "UPDATE local_template_exercises SET sets_json = ? WHERE id = ?",
        convertPrescriptionJson(String(row.sets_json), from, unit),
        row.id,
      );
  for (const row of await db.getAllAsync<Row>(
    "SELECT * FROM local_exercise_place_weights",
  ))
    if (
      added
        .get("local_exercise_place_weights")
        ?.has(
          JSON.stringify([row.place_id, row.exercise_slug, row.machine_key]),
        )
    )
      await db.runAsync(
        "UPDATE local_exercise_place_weights SET sets_json = ? WHERE place_id = ? AND exercise_slug = ? AND machine_key = ?",
        convertPrescriptionJson(String(row.sets_json), from, unit),
        row.place_id,
        row.exercise_slug,
        row.machine_key,
      );
  for (const row of transfer.snapshot.outbox)
    if (
      (row.entity_type === "session" ||
        row.entity_type === "template" ||
        row.entity_type === "template_quarantined") &&
      added
        .get(
          row.entity_type === "session" ? "local_sessions" : "local_templates",
        )
        ?.has(String(row.entity_id))
    )
      await db.runAsync(
        "UPDATE local_sync_outbox SET payload_json = ? WHERE operation_id = ?",
        convertPrescriptionJson(String(row.payload_json), from, unit),
        row.operation_id,
      );
}

async function completeTransfer(
  source: SQLiteDatabase,
  transfer: Transfer,
  current: SQLiteDatabase,
  currentOwner: string | null,
) {
  const target =
    currentOwner === transfer.owner
      ? current
      : await openDatabaseAsync(accountDatabaseName(transfer.owner), {
          useNewConnection: true,
        });
  try {
    await migrateLocalDatabase(target);
    await importTransfer(target, transfer);
    await source.withExclusiveTransactionAsync(async (txn) => {
      if (transfer.guest) {
        for (const table of [...TABLES].reverse())
          await txn.runAsync(`DELETE FROM ${table}`);
        await txn.runAsync("DELETE FROM local_sync_outbox");
        await txn.runAsync("DELETE FROM local_metadata");
        await txn.runAsync(
          "UPDATE local_preferences SET unit = 'lb', bar_weight_lb = 45, bar_weight_kg = 20, active_workout_mode = 'list', rest_timer_enabled = 1 WHERE id = 1",
        );
        await stampOwner(txn, null);
      } else {
        // Preserve the entire legacy file, including its pending operations.
        await put(txn, "storage:legacy-imported", transfer.owner);
      }
      await txn.runAsync("DELETE FROM local_metadata WHERE key = ?", CLAIM);
    });
  } finally {
    if (target !== current) await target.closeAsync();
  }
}

async function prepare(db: SQLiteDatabase, owner: string | null) {
  await migrateLocalDatabase(db);
  await stampOwner(db, owner);
  await db.runAsync(
    "DELETE FROM local_metadata WHERE key = 'recovery:legacy-available'",
  );
  // Restored credentials identify the last login, not who authored rows in the
  // old shared database. Only an explicit persisted owner can claim that file.
  const legacy = await openDatabaseAsync(LEGACY_DATABASE, {
    useNewConnection: true,
  });
  try {
    const version = await legacy.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version",
    );
    if (version && version.user_version > 0) {
      const imported = await metadata(legacy, "storage:legacy-imported");
      const owned = await metadata(legacy, OWNER);
      const knownOwner = owned?.startsWith("account:") ? owned.slice(8) : null;
      if (!imported && knownOwner) {
        await migrateLocalDatabase(legacy);
        const stored = await metadata(legacy, CLAIM);
        const transfer: Transfer = stored
          ? JSON.parse(stored)
          : {
              id: randomUUID(),
              owner: knownOwner,
              guest: false,
              snapshot: await snapshot(legacy),
            };
        await put(legacy, CLAIM, JSON.stringify(transfer));
        await completeTransfer(legacy, transfer, db, owner);
      } else if (!imported || imported === owner)
        await put(db, "recovery:legacy-available", "1");
    }
  } finally {
    await legacy.closeAsync();
  }
  const guest = owner
    ? await openDatabaseAsync(GUEST_DATABASE, { useNewConnection: true })
    : db;
  try {
    await migrateLocalDatabase(guest);
    await stampOwner(guest, null);
    await Promise.allSettled([...(writes.get(GUEST_DATABASE) ?? [])]);
    const stored = await metadata(guest, CLAIM);
    if (stored) await completeTransfer(guest, JSON.parse(stored), db, owner);
    if (owner) {
      const data = await snapshot(guest);
      if (
        data.outbox.length ||
        Object.values(data.tables).some((rows) => rows.length)
      ) {
        const transfer: Transfer = {
          id: randomUUID(),
          owner,
          guest: true,
          snapshot: data,
        };
        await put(guest, CLAIM, JSON.stringify(transfer));
        await completeTransfer(guest, transfer, db, owner);
      }
    }
  } finally {
    if (guest !== db) await guest.closeAsync();
  }
}

export function prepareScopedDatabase(
  db: SQLiteDatabase,
  owner: string | null,
) {
  const result = preparation.then(() => prepare(db, owner));
  preparation = result.catch(() => undefined);
  return result;
}
