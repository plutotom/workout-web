import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type WorkoutBackupSnapshot,
} from "./workout-backup";

export type AccountBackupMetadata = Pick<
  WorkoutBackupSnapshot,
  | "createdAt"
  | "preferences"
  | "customExercises"
  | "templates"
  | "exerciseNotes"
>;

/** Join bounded account metadata with all paginated workout-history pages. */
export function assembleAccountBackup(
  metadata: AccountBackupMetadata,
  sessions: WorkoutBackupSnapshot["sessions"],
): WorkoutBackupSnapshot {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    ...metadata,
    sessions,
  };
}
