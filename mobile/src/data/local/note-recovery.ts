import type { SQLiteDatabase } from "expo-sqlite";

const BASELINE = "note:baseline:";
const ALTERNATIVES = "note:alternatives:";
const REVISION = "note:revision:";
export type NoteAlternative = { slug: string; notes: string; savedAt: number };

export async function noteBaseline(db: SQLiteDatabase, slug: string) {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_metadata WHERE key = ?",
    BASELINE + slug,
  );
  return row?.value;
}

export async function setNoteBaseline(
  db: SQLiteDatabase,
  slug: string,
  notes: string,
) {
  await db.runAsync(
    "INSERT INTO local_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    BASELINE + slug,
    notes,
  );
}

export async function noteRevision(db: SQLiteDatabase, slug: string) {
  return Number(
    (
      await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM local_metadata WHERE key = ?",
        REVISION + slug,
      )
    )?.value ?? 0,
  );
}

export async function setNoteRevision(
  db: SQLiteDatabase,
  slug: string,
  revision: number,
) {
  await db.runAsync(
    "INSERT INTO local_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    REVISION + slug,
    String(revision),
  );
}

export async function remapNoteRecovery(
  db: SQLiteDatabase,
  oldSlug: string,
  newSlug: string,
) {
  const old = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_metadata WHERE key = ?",
    ALTERNATIVES + oldSlug,
  );
  if (old)
    for (const version of JSON.parse(old.value) as NoteAlternative[])
      await keepNoteAlternative(db, newSlug, version.notes);
  for (const prefix of [BASELINE, REVISION]) {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM local_metadata WHERE key = ?",
      prefix + oldSlug,
    );
    if (row)
      await db.runAsync(
        "INSERT OR IGNORE INTO local_metadata (key, value) VALUES (?, ?)",
        prefix + newSlug,
        row.value,
      );
    await db.runAsync(
      "DELETE FROM local_metadata WHERE key = ?",
      prefix + oldSlug,
    );
  }
  await db.runAsync(
    "DELETE FROM local_metadata WHERE key = ?",
    ALTERNATIVES + oldSlug,
  );
}

export async function keepNoteAlternative(
  db: SQLiteDatabase,
  slug: string,
  notes: string,
) {
  const key = ALTERNATIVES + slug;
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_metadata WHERE key = ?",
    key,
  );
  const alternatives: NoteAlternative[] = row ? JSON.parse(row.value) : [];
  if (alternatives.some((item) => item.notes === notes)) return;
  alternatives.push({ slug, notes, savedAt: Date.now() });
  await db.runAsync(
    "INSERT INTO local_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    JSON.stringify(alternatives),
  );
}

export async function listNoteAlternatives(
  db: SQLiteDatabase,
): Promise<NoteAlternative[]> {
  const rows = await db.getAllAsync<{ value: string }>(
    "SELECT value FROM local_metadata WHERE key LIKE 'note:alternatives:%' ORDER BY key",
  );
  return rows.flatMap((row) => JSON.parse(row.value) as NoteAlternative[]);
}
