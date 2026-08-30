import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  backupFileName,
  parseBackup,
  serializeBackup,
  type WorkoutBackupSnapshot,
} from "@/data/local/backup";
import {
  bundleFileName,
  encodeBundleCode,
  serializeBundle,
  type ParseResult,
  type WorkoutExportBundle,
} from "@shared/workout-export";
import { parseImportedFile } from "@shared/workout-backup";

/**
 * Native transports for the portable bundle. The format itself lives in
 * `@shared/workout-export` and is identical on web — only the plumbing for
 * getting bytes in and out of the device differs.
 */

/**
 * Write the bundle to a temp `.json` and open the iOS share sheet, so it can go
 * to Messages, Mail, AirDrop, Files — whatever the user already uses.
 *
 * Cache (not documents) because the file is a courier, not user data: iOS is
 * free to reclaim it once the share sheet is done with it.
 */
export async function shareBundleFile(
  bundle: WorkoutExportBundle,
): Promise<{ shared: boolean; reason?: string }> {
  if (!(await Sharing.isAvailableAsync())) {
    return { shared: false, reason: "Sharing isn't available on this device" };
  }

  const file = new File(Paths.cache, bundleFileName(bundle));
  try {
    // A previous export with the same name may still be sitting in the cache.
    if (file.exists) file.delete();
    file.create();
    file.write(serializeBundle(bundle));

    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "Share workouts",
    });
    return { shared: true };
  } catch {
    return { shared: false, reason: "Couldn't create the export file" };
  }
}

/** Open the system file picker and parse whatever the user chose. */
export async function pickBundleFile(): Promise<ParseResult | null> {
  const picked = await File.pickFileAsync({
    // Some apps hand a .json attachment over as text/plain or octet-stream, so
    // the filter stays wide and `parseImportedFile` does the real validation.
    mimeTypes: ["application/json", "text/plain", "application/octet-stream"],
  });
  if (picked.canceled) return null;

  try {
    return parseImportedFile(await picked.result.text());
  } catch {
    return { ok: false, error: "Couldn't read that file" };
  }
}

/**
 * Same share sheet, different payload: a full backup snapshot rather than a
 * portable bundle. "Save to Files" → iCloud Drive is the point of this one, and
 * that destination needs no entitlement — the user picks it.
 */
export async function shareBackupFile(
  snapshot: WorkoutBackupSnapshot,
): Promise<{ shared: boolean; reason?: string }> {
  if (!(await Sharing.isAvailableAsync())) {
    return { shared: false, reason: "Sharing isn't available on this device" };
  }

  const file = new File(Paths.cache, backupFileName(snapshot));
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(serializeBackup(snapshot));

    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "Save backup",
    });
    return { shared: true };
  } catch {
    return { shared: false, reason: "Couldn't create the backup file" };
  }
}

export type PickedBackupFile =
  | { ok: true; kind: "backup"; snapshot: WorkoutBackupSnapshot }
  | { ok: true; kind: "bundle"; bundle: WorkoutExportBundle }
  | { ok: false; error: string };

/** Open the system file picker and parse a backup or a portable template export. */
export async function pickBackupFile(): Promise<PickedBackupFile | null> {
  const picked = await File.pickFileAsync({
    mimeTypes: ["application/json", "text/plain", "application/octet-stream"],
  });
  if (picked.canceled) return null;

  try {
    const text = await picked.result.text();
    const backup = parseBackup(text);
    if (backup.ok)
      return { ok: true, kind: "backup", snapshot: backup.snapshot };
    const imported = parseImportedFile(text);
    if (imported.ok)
      return { ok: true, kind: "bundle", bundle: imported.bundle };
    return { ok: false, error: backup.error };
  } catch {
    return { ok: false, error: "Couldn't read that file" };
  }
}

/** Copy the self-contained code — the transport that needs no network at all. */
export async function copyBundleCode(
  bundle: WorkoutExportBundle,
): Promise<void> {
  await Clipboard.setStringAsync(encodeBundleCode(bundle));
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

/** Read a code straight from the clipboard, so importing is a single tap. */
export async function pasteBundleFromClipboard(): Promise<ParseResult> {
  const text = await Clipboard.getStringAsync();
  if (!text.trim()) {
    return { ok: false, error: "Your clipboard is empty" };
  }
  return parseImportedFile(text);
}
