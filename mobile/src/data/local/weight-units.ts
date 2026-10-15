import type { SQLiteDatabase } from "expo-sqlite";
import { convertWeight } from "@shared/workout-export";

export type WeightUnit = "lb" | "kg";

/** Prescriptions only: original free-text notes and noteUnit never change. */
export function convertPrescriptionJson(
  json: string,
  from: WeightUnit,
  to: WeightUnit,
) {
  return JSON.stringify(
    JSON.parse(json, (key, value) =>
      (key === "weight" || key === "targetWeight") && typeof value === "number"
        ? convertWeight(value, from, to)
        : value,
    ),
  );
}

/** Called inside the bootstrap transaction, before any uploads can start. */
export async function convertLocalWeights(
  db: SQLiteDatabase,
  from: WeightUnit,
  to: WeightUnit,
) {
  if (from === to) return;
  const sets = await db.getAllAsync<{
    id: string;
    weight: number;
    target_weight: number;
  }>("SELECT id, weight, target_weight FROM local_sets");
  for (const set of sets)
    await db.runAsync(
      "UPDATE local_sets SET weight = ?, target_weight = ? WHERE id = ?",
      convertWeight(set.weight, from, to),
      convertWeight(set.target_weight, from, to),
      set.id,
    );
  const templates = await db.getAllAsync<{ id: string; sets_json: string }>(
    "SELECT id, sets_json FROM local_template_exercises",
  );
  for (const row of templates)
    await db.runAsync(
      "UPDATE local_template_exercises SET sets_json = ? WHERE id = ?",
      convertPrescriptionJson(row.sets_json, from, to),
      row.id,
    );
  const memories = await db.getAllAsync<{
    place_id: string;
    exercise_slug: string;
    machine_key: string;
    sets_json: string;
  }>(
    "SELECT place_id, exercise_slug, machine_key, sets_json FROM local_exercise_place_weights",
  );
  for (const row of memories)
    await db.runAsync(
      "UPDATE local_exercise_place_weights SET sets_json = ? WHERE place_id = ? AND exercise_slug = ? AND machine_key = ?",
      convertPrescriptionJson(row.sets_json, from, to),
      row.place_id,
      row.exercise_slug,
      row.machine_key,
    );
  const pending = await db.getAllAsync<{
    operation_id: string;
    payload_json: string;
  }>(
    "SELECT operation_id, payload_json FROM local_sync_outbox WHERE entity_type IN ('session', 'template', 'template_quarantined')",
  );
  for (const row of pending)
    await db.runAsync(
      "UPDATE local_sync_outbox SET payload_json = ? WHERE operation_id = ?",
      convertPrescriptionJson(row.payload_json, from, to),
      row.operation_id,
    );
}
