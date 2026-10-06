import type { SQLiteDatabase } from "expo-sqlite";

/** Called inside the acknowledgment transaction. Keeps the phone's original
 * id, merges a bootstrap echo, and retains the newest queued edit. */
export async function adoptTemplateIdentity(
  txn: SQLiteDatabase,
  templateId: string,
  remoteId: string,
) {
  const original = await txn.getFirstAsync<{ id: string }>(
    "SELECT id FROM local_templates WHERE id = ?",
    templateId,
  );
  // A local deletion during the upload must not delete a different row that
  // bootstrap has already downloaded under the acknowledged remote id.
  if (!original) return;
  const alias = await txn.getFirstAsync<{ id: string }>(
    "SELECT id FROM local_templates WHERE remote_id = ? AND id != ?",
    remoteId,
    templateId,
  );
  if (alias) {
    const pending = await txn.getAllAsync<{
      entity_id: string;
      operation_id: string;
      payload_json: string;
    }>(
      `SELECT entity_id, operation_id, payload_json FROM local_sync_outbox
        WHERE entity_type = 'template' AND entity_id IN (?, ?)
        ORDER BY created_at DESC, operation_id DESC`,
      templateId,
      alias.id,
    );
    const latest = pending[0];
    if (latest?.entity_id === alias.id) {
      // An edit made to the cloud echo while an earlier acknowledgment was
      // stuck wins over that earlier snapshot; keep its operation id.
      await txn.runAsync(
        `UPDATE local_templates SET
          (name, updated_at, last_place_id) =
          (SELECT name, updated_at, last_place_id FROM local_templates WHERE id = ?)
          WHERE id = ?`,
        alias.id,
        templateId,
      );
      await txn.runAsync(
        "DELETE FROM local_template_exercises WHERE template_id = ?",
        templateId,
      );
      await txn.runAsync(
        "UPDATE local_template_exercises SET template_id = ? WHERE template_id = ?",
        templateId,
        alias.id,
      );
    }
    // Move session links before removing the echo (ON DELETE SET NULL).
    await txn.runAsync(
      "UPDATE local_sessions SET template_id = ? WHERE template_id = ?",
      templateId,
      alias.id,
    );
    for (const row of pending.slice(1)) {
      await txn.runAsync(
        "DELETE FROM local_sync_outbox WHERE operation_id = ?",
        row.operation_id,
      );
    }
    if (latest) {
      const payload = JSON.parse(latest.payload_json);
      await txn.runAsync(
        "UPDATE local_sync_outbox SET entity_id = ?, payload_json = ? WHERE operation_id = ?",
        templateId,
        JSON.stringify({ ...payload, localId: templateId, remoteId }),
        latest.operation_id,
      );
    }
    await txn.runAsync(
      "DELETE FROM local_sync_outbox WHERE entity_id = ? AND entity_type = 'template_quarantined'",
      alias.id,
    );
    await txn.runAsync(
      "DELETE FROM local_template_exercises WHERE template_id = ?",
      alias.id,
    );
    await txn.runAsync("DELETE FROM local_templates WHERE id = ?", alias.id);
  }
  await txn.runAsync(
    "UPDATE local_templates SET remote_id = ? WHERE id = ?",
    remoteId,
    templateId,
  );
  // A newer save may have replaced the in-flight operation. Give that queued
  // snapshot the durable id without deleting it or generating another upload.
  const queued = await txn.getFirstAsync<{
    operation_id: string;
    payload_json: string;
  }>(
    "SELECT operation_id, payload_json FROM local_sync_outbox WHERE entity_type = 'template' AND entity_id = ?",
    templateId,
  );
  if (queued) {
    const payload = JSON.parse(queued.payload_json);
    await txn.runAsync(
      "UPDATE local_sync_outbox SET payload_json = ? WHERE operation_id = ?",
      JSON.stringify({ ...payload, remoteId }),
      queued.operation_id,
    );
  }
}

/** A subscribed cloud echo must not overwrite an edit waiting in the outbox. */
export async function templateHasPendingEdit(
  txn: SQLiteDatabase,
  templateId: string,
) {
  return Boolean(
    await txn.getFirstAsync<{ entity_id: string }>(
      "SELECT entity_id FROM local_sync_outbox WHERE entity_type IN ('template', 'template_quarantined') AND entity_id = ?",
      templateId,
    ),
  );
}
