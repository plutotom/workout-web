import type { SQLiteDatabase } from "expo-sqlite";
import {
  storedCompositionMatchesTarget,
  type StoredPlateComposition,
} from "@shared/plates/composition";
import { STANDARD_PLATES } from "@shared/plates/solver";

export type PlateCompositionSave = {
  exerciseSlug: string;
  composition: StoredPlateComposition;
};

export function parsePlateComposition(
  json: string,
): StoredPlateComposition | null {
  try {
    const value = JSON.parse(json);
    if (
      !value ||
      (value.unit !== "lb" && value.unit !== "kg") ||
      typeof value.countBar !== "boolean" ||
      !Number.isFinite(value.bar) ||
      value.bar < 0 ||
      !value.counts ||
      typeof value.counts !== "object" ||
      Array.isArray(value.counts)
    )
      return null;
    const plates = STANDARD_PLATES[value.unit as "lb" | "kg"].plates;
    if (
      !Object.entries(value.counts).every(
        ([plate, count]) =>
          plates.includes(Number(plate)) &&
          Number.isSafeInteger(count) &&
          Number(count) >= 0,
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

// The caller supplies the currently selected account's database. Joining the
// live lift prevents a replaced/deleted set from inheriting stale cache data.
export async function readPlateComposition(
  db: SQLiteDatabase,
  setId: string,
  slug: string,
) {
  const row = await db.getFirstAsync<{ composition_json: string }>(
    `SELECT p.composition_json FROM local_plate_compositions p
     JOIN local_sets s ON s.id = p.set_id
     JOIN local_session_exercises e ON e.id = s.session_exercise_id
     WHERE p.set_id = ? AND p.exercise_slug = ? AND e.slug = ?`,
    setId,
    slug,
    slug,
  );
  return row ? parsePlateComposition(row.composition_json) : null;
}

// Called inside the same workout transaction as the weight and outbox write.
export async function writePlateComposition(
  db: SQLiteDatabase,
  setId: string,
  save: PlateCompositionSave,
  weight: number,
) {
  const composition = parsePlateComposition(JSON.stringify(save.composition));
  const lift = await db.getFirstAsync<{ slug: string }>(
    `SELECT e.slug FROM local_sets s JOIN local_session_exercises e
     ON e.id = s.session_exercise_id WHERE s.id = ?`,
    setId,
  );
  if (
    !composition ||
    lift?.slug !== save.exerciseSlug ||
    !storedCompositionMatchesTarget(
      composition,
      weight,
      STANDARD_PLATES[composition.unit].plates,
    )
  ) {
    throw new Error("Plate composition does not match this set and weight");
  }
  await db.runAsync(
    `INSERT INTO local_plate_compositions (set_id, exercise_slug, composition_json)
     VALUES (?, ?, ?) ON CONFLICT(set_id, exercise_slug)
     DO UPDATE SET composition_json = excluded.composition_json`,
    setId,
    save.exerciseSlug,
    JSON.stringify(composition),
  );
}
