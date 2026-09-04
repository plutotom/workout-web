import {
  CODE_PREFIX,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  parseBundle,
  type ParseResult,
  type WorkoutExportBundle,
} from "./workout-export";

/**
 * Phone-database snapshot. Deliberately separate from the portable template
 * bundle: a backup carries every logged set, not just templates you might send
 * a friend. Both clients parse this file so an iOS backup can seed a web
 * account (templates + custom lifts + notes) and a web export can restore
 * onto a phone.
 *
 * Restore semantics live in `mobile/src/data/local/backup.ts`. This module is
 * the wire format: zero runtime imports beyond the portable helper, same
 * constraint as `workout-export.ts`.
 */

export const BACKUP_FORMAT = "workout.backup";
export const BACKUP_VERSION = 1;

export type BackupMuscleGroup =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "core";

export type BackupSessionStatus = "in_progress" | "completed" | "abandoned";
export type BackupSessionKind = "tracked" | "health_summary";

export type BackupPreferences = {
  unit: "lb" | "kg";
  barWeightLb: number;
  barWeightKg: number;
  activeWorkoutMode: "list" | "focus";
  restTimerEnabled: boolean;
  restTimerNotificationsEnabled: boolean;
  appleHealthImportNotificationsEnabled: boolean;
};

export type BackupCustomExercise = {
  id: string;
  /** Opaque Convex document id when this row already exists in the account. */
  remoteId?: string | null;
  slug: string;
  name: string;
  short: string | null;
  category: BackupMuscleGroup;
  usesBar: boolean;
  archived: boolean;
  updatedAt: number;
};

export type BackupTemplateSet = { weight: number; reps: number };

export type BackupTemplate = {
  id: string;
  /** Opaque Convex document id when this row already exists in the account. */
  remoteId?: string | null;
  name: string;
  updatedAt: number;
  lastPlaceId?: string | null;
  exercises: Array<{
    id: string;
    slug: string;
    orderIndex: number;
    sets: BackupTemplateSet[];
  }>;
};

export type BackupExerciseNote = {
  slug: string;
  notes: string;
  updatedAt: number;
};

export type BackupSet = {
  id: string;
  orderIndex: number;
  targetWeight: number;
  targetReps: number;
  weight: number;
  reps: number;
  completed: boolean;
  completedAt: number | null;
};

export type BackupSessionExercise = {
  id: string;
  slug: string;
  orderIndex: number;
  restSeconds: number;
  notes: string | null;
  machineId?: string | null;
  machineName?: string | null;
  sets: BackupSet[];
};

export type BackupSession = {
  id: string;
  /** Opaque Convex document id when this row already exists in the account. */
  remoteId?: string | null;
  templateId: string | null;
  /** Convex template id, kept separately from the phone-local template id. */
  remoteTemplateId?: string | null;
  templateName: string;
  status: BackupSessionStatus;
  sessionKind?: BackupSessionKind;
  startedAt: number;
  completedAt: number | null;
  updatedAt: number;
  countsTowardGoals?: boolean;
  externalProvider?: "apple_health" | null;
  externalId?: string | null;
  activityType?: string | null;
  sourceName?: string | null;
  sourceBundleId?: string | null;
  durationSeconds?: number | null;
  energyKcal?: number | null;
  distanceMeters?: number | null;
  importedAt?: number | null;
  placeId?: string | null;
  placeName?: string | null;
  exercises: BackupSessionExercise[];
};

export type BackupPlace = {
  id: string;
  remoteId?: string | null;
  name: string;
  starred: boolean;
  archived: boolean;
  lastUsedAt: number | null;
  updatedAt: number;
};

export type BackupMachine = {
  id: string;
  remoteId?: string | null;
  placeId: string;
  exerciseSlug: string;
  name: string;
  isDefault: boolean;
  archived: boolean;
  lastUsedAt: number | null;
  updatedAt: number;
};

export type BackupPlaceWeight = {
  placeId: string;
  exerciseSlug: string;
  machineKey: string;
  sets: BackupTemplateSet[];
  updatedAt: number;
};

export type WorkoutBackupSnapshot = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: number;
  preferences: BackupPreferences;
  customExercises: BackupCustomExercise[];
  templates: BackupTemplate[];
  exerciseNotes: BackupExerciseNote[];
  sessions: BackupSession[];
  places?: BackupPlace[];
  machines?: BackupMachine[];
  placeWeights?: BackupPlaceWeight[];
};

const MAX_INPUT_LENGTH = 32_000_000;
const MAX_SESSIONS = 20_000;
const MAX_TEMPLATES = 1_000;
const MAX_CUSTOM_EXERCISES = 1_000;
const MAX_NOTES = 5_000;
const MAX_EXERCISES_PER_SESSION = 200;
const MAX_SETS_PER_EXERCISE = 200;
const MAX_PLACES = 50;
const MAX_MACHINES = 2_000;
const MAX_PLACE_WEIGHTS = 5_000;

const MUSCLE_GROUPS: readonly BackupMuscleGroup[] = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "core",
];

const SESSION_STATUSES: readonly BackupSessionStatus[] = [
  "in_progress",
  "completed",
  "abandoned",
];

export function serializeBackup(snapshot: WorkoutBackupSnapshot): string {
  return JSON.stringify(snapshot);
}

export function backupFileName(snapshot: WorkoutBackupSnapshot): string {
  const date = new Date(snapshot.createdAt).toISOString().slice(0, 10);
  return `workout-backup-${date}.json`;
}

export type BackupParseResult =
  | { ok: true; snapshot: WorkoutBackupSnapshot }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNonEmptyString(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value
    ? value
    : null;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseBackup(input: string): BackupParseResult {
  const text = stripBom(input).trim();
  if (!text) return { ok: false, error: "That file is empty" };
  if (text.length > MAX_INPUT_LENGTH)
    return { ok: false, error: "That backup is too large to restore" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "That doesn't look like a backup file — expected a .json backup",
    };
  }
  return validateBackup(parsed);
}

/**
 * Structural check on an untrusted file. Restore runs raw SQL against these
 * values, so everything that reaches the database is proved here first.
 *
 * Optional fields added after the first backup version (sessionKind, Health
 * metadata, notification prefs) default rather than fail, so a file written
 * by an older app still restores into a newer one.
 */
export function validateBackup(value: unknown): BackupParseResult {
  if (!isRecord(value)) return { ok: false, error: "Backup is not an object" };
  if (value.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error:
        value.format === EXPORT_FORMAT
          ? "That's a shared workout file, not a backup — use Import templates instead"
          : "That file isn't a workout backup",
    };
  }
  if (value.version !== BACKUP_VERSION) {
    return {
      ok: false,
      error:
        isFiniteNumber(value.version) && value.version > BACKUP_VERSION
          ? "This backup was made by a newer version of the app — update and try again"
          : "This backup uses an unsupported format version",
    };
  }

  const preferences = validatePreferences(value.preferences);

  const customExercises: BackupCustomExercise[] = [];
  const rawCustoms = Array.isArray(value.customExercises)
    ? value.customExercises
    : [];
  if (rawCustoms.length > MAX_CUSTOM_EXERCISES)
    return { ok: false, error: "That backup has too many custom exercises" };
  for (const raw of rawCustoms) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || typeof raw.slug !== "string") continue;
    if (typeof raw.name !== "string") continue;
    customExercises.push({
      id: raw.id,
      remoteId: optionalNonEmptyString(raw.remoteId),
      slug: raw.slug,
      name: raw.name,
      short: optionalString(raw.short),
      category: MUSCLE_GROUPS.includes(raw.category as BackupMuscleGroup)
        ? (raw.category as BackupMuscleGroup)
        : "chest",
      usesBar: raw.usesBar === true,
      archived: raw.archived === true,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
    });
  }

  const templates: BackupTemplate[] = [];
  const rawTemplates = Array.isArray(value.templates) ? value.templates : [];
  if (rawTemplates.length > MAX_TEMPLATES)
    return { ok: false, error: "That backup has too many templates" };
  for (const raw of rawTemplates) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    const rawExercises = Array.isArray(raw.exercises) ? raw.exercises : [];
    const exercises: BackupTemplate["exercises"] = [];
    for (const rawExercise of rawExercises.slice(
      0,
      MAX_EXERCISES_PER_SESSION,
    )) {
      if (!isRecord(rawExercise)) continue;
      if (
        typeof rawExercise.id !== "string" ||
        typeof rawExercise.slug !== "string"
      )
        continue;
      const rawSets = Array.isArray(rawExercise.sets) ? rawExercise.sets : [];
      exercises.push({
        id: rawExercise.id,
        slug: rawExercise.slug,
        orderIndex: isFiniteNumber(rawExercise.orderIndex)
          ? rawExercise.orderIndex
          : exercises.length,
        sets: rawSets
          .slice(0, MAX_SETS_PER_EXERCISE)
          .flatMap((set) =>
            isRecord(set) &&
            isFiniteNumber(set.weight) &&
            isFiniteNumber(set.reps)
              ? [{ weight: set.weight, reps: set.reps }]
              : [],
          ),
      });
    }
    templates.push({
      id: raw.id,
      remoteId: optionalNonEmptyString(raw.remoteId),
      name: raw.name,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
      lastPlaceId: optionalString(raw.lastPlaceId),
      exercises,
    });
  }

  const exerciseNotes: BackupExerciseNote[] = [];
  const rawNotes = Array.isArray(value.exerciseNotes)
    ? value.exerciseNotes
    : [];
  if (rawNotes.length > MAX_NOTES)
    return { ok: false, error: "That backup has too many exercise notes" };
  for (const raw of rawNotes) {
    if (!isRecord(raw)) continue;
    if (typeof raw.slug !== "string" || typeof raw.notes !== "string") continue;
    exerciseNotes.push({
      slug: raw.slug,
      notes: raw.notes,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
    });
  }

  const sessions: BackupSession[] = [];
  const rawSessions = Array.isArray(value.sessions) ? value.sessions : [];
  if (rawSessions.length > MAX_SESSIONS)
    return { ok: false, error: "That backup has too many workouts" };
  for (const raw of rawSessions) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string") continue;
    if (!SESSION_STATUSES.includes(raw.status as BackupSessionStatus)) continue;

    const rawExercises = Array.isArray(raw.exercises) ? raw.exercises : [];
    const exercises: BackupSessionExercise[] = [];
    for (const rawExercise of rawExercises.slice(
      0,
      MAX_EXERCISES_PER_SESSION,
    )) {
      if (!isRecord(rawExercise)) continue;
      if (
        typeof rawExercise.id !== "string" ||
        typeof rawExercise.slug !== "string"
      )
        continue;
      const rawSets = Array.isArray(rawExercise.sets) ? rawExercise.sets : [];
      const sets: BackupSet[] = [];
      for (const rawSet of rawSets.slice(0, MAX_SETS_PER_EXERCISE)) {
        if (!isRecord(rawSet) || typeof rawSet.id !== "string") continue;
        sets.push({
          id: rawSet.id,
          orderIndex: isFiniteNumber(rawSet.orderIndex)
            ? rawSet.orderIndex
            : sets.length,
          targetWeight: isFiniteNumber(rawSet.targetWeight)
            ? rawSet.targetWeight
            : 0,
          targetReps: isFiniteNumber(rawSet.targetReps) ? rawSet.targetReps : 0,
          weight: isFiniteNumber(rawSet.weight) ? rawSet.weight : 0,
          reps: isFiniteNumber(rawSet.reps) ? rawSet.reps : 0,
          completed: rawSet.completed === true,
          completedAt: isFiniteNumber(rawSet.completedAt)
            ? rawSet.completedAt
            : null,
        });
      }
      exercises.push({
        id: rawExercise.id,
        slug: rawExercise.slug,
        orderIndex: isFiniteNumber(rawExercise.orderIndex)
          ? rawExercise.orderIndex
          : exercises.length,
        restSeconds: isFiniteNumber(rawExercise.restSeconds)
          ? rawExercise.restSeconds
          : 75,
        notes: optionalString(rawExercise.notes),
        machineId: optionalString(rawExercise.machineId),
        machineName: optionalString(rawExercise.machineName),
        sets,
      });
    }

    sessions.push({
      id: raw.id,
      remoteId: optionalNonEmptyString(raw.remoteId),
      templateId: optionalString(raw.templateId),
      remoteTemplateId: optionalNonEmptyString(raw.remoteTemplateId),
      templateName:
        typeof raw.templateName === "string" ? raw.templateName : "Workout",
      status: raw.status as BackupSessionStatus,
      sessionKind:
        raw.sessionKind === "health_summary" ? "health_summary" : "tracked",
      startedAt: isFiniteNumber(raw.startedAt) ? raw.startedAt : 0,
      completedAt: isFiniteNumber(raw.completedAt) ? raw.completedAt : null,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
      countsTowardGoals: raw.countsTowardGoals !== false,
      externalProvider:
        raw.externalProvider === "apple_health" ? "apple_health" : null,
      externalId: optionalString(raw.externalId),
      activityType: optionalString(raw.activityType),
      sourceName: optionalString(raw.sourceName),
      sourceBundleId: optionalString(raw.sourceBundleId),
      durationSeconds: isFiniteNumber(raw.durationSeconds)
        ? raw.durationSeconds
        : null,
      energyKcal: isFiniteNumber(raw.energyKcal) ? raw.energyKcal : null,
      distanceMeters: isFiniteNumber(raw.distanceMeters)
        ? raw.distanceMeters
        : null,
      importedAt: isFiniteNumber(raw.importedAt) ? raw.importedAt : null,
      placeId: optionalString(raw.placeId),
      placeName: optionalString(raw.placeName),
      exercises,
    });
  }

  const places = parseBackupPlaces(value.places);
  if (!places.ok) return places;
  const machines = parseBackupMachines(value.machines);
  if (!machines.ok) return machines;
  const placeWeights = parseBackupPlaceWeights(value.placeWeights);
  if (!placeWeights.ok) return placeWeights;

  if (
    sessions.length === 0 &&
    templates.length === 0 &&
    customExercises.length === 0 &&
    exerciseNotes.length === 0
  ) {
    return { ok: false, error: "That backup is empty" };
  }

  return {
    ok: true,
    snapshot: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : Date.now(),
      preferences,
      customExercises,
      templates,
      exerciseNotes,
      sessions,
      ...(places.value && places.value.length > 0
        ? { places: places.value }
        : {}),
      ...(machines.value && machines.value.length > 0
        ? { machines: machines.value }
        : {}),
      ...(placeWeights.value && placeWeights.value.length > 0
        ? { placeWeights: placeWeights.value }
        : {}),
    },
  };
}

type OptionalParse<T> =
  | { ok: true; value: T[] | undefined }
  | { ok: false; error: string };

function parseBackupPlaces(value: unknown): OptionalParse<BackupPlace> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) return { ok: true, value: undefined };
  if (value.length > MAX_PLACES)
    return { ok: false, error: "That backup has too many places" };
  const places: BackupPlace[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    places.push({
      id: raw.id,
      remoteId: optionalNonEmptyString(raw.remoteId),
      name: raw.name,
      starred: raw.starred === true,
      archived: raw.archived === true,
      lastUsedAt: isFiniteNumber(raw.lastUsedAt) ? raw.lastUsedAt : null,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
    });
  }
  return { ok: true, value: places };
}

function parseBackupMachines(value: unknown): OptionalParse<BackupMachine> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) return { ok: true, value: undefined };
  if (value.length > MAX_MACHINES)
    return { ok: false, error: "That backup has too many machines" };
  const machines: BackupMachine[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || typeof raw.placeId !== "string") continue;
    if (typeof raw.exerciseSlug !== "string" || typeof raw.name !== "string")
      continue;
    machines.push({
      id: raw.id,
      remoteId: optionalNonEmptyString(raw.remoteId),
      placeId: raw.placeId,
      exerciseSlug: raw.exerciseSlug,
      name: raw.name,
      isDefault: raw.isDefault === true,
      archived: raw.archived === true,
      lastUsedAt: isFiniteNumber(raw.lastUsedAt) ? raw.lastUsedAt : null,
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
    });
  }
  return { ok: true, value: machines };
}

function parseBackupPlaceWeights(
  value: unknown,
): OptionalParse<BackupPlaceWeight> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) return { ok: true, value: undefined };
  if (value.length > MAX_PLACE_WEIGHTS)
    return { ok: false, error: "That backup has too many place weights" };
  const weights: BackupPlaceWeight[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (typeof raw.placeId !== "string") continue;
    if (typeof raw.exerciseSlug !== "string") continue;
    if (typeof raw.machineKey !== "string") continue;
    const rawSets = Array.isArray(raw.sets) ? raw.sets : [];
    weights.push({
      placeId: raw.placeId,
      exerciseSlug: raw.exerciseSlug,
      machineKey: raw.machineKey,
      sets: rawSets
        .slice(0, MAX_SETS_PER_EXERCISE)
        .flatMap((set) =>
          isRecord(set) &&
          isFiniteNumber(set.weight) &&
          isFiniteNumber(set.reps)
            ? [{ weight: set.weight, reps: set.reps }]
            : [],
        ),
      updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
    });
  }
  return { ok: true, value: weights };
}

function validatePreferences(value: unknown): BackupPreferences {
  const raw = isRecord(value) ? value : {};
  return {
    unit: raw.unit === "kg" ? "kg" : "lb",
    barWeightLb: isFiniteNumber(raw.barWeightLb) ? raw.barWeightLb : 45,
    barWeightKg: isFiniteNumber(raw.barWeightKg) ? raw.barWeightKg : 20,
    activeWorkoutMode: raw.activeWorkoutMode === "focus" ? "focus" : "list",
    restTimerEnabled: raw.restTimerEnabled !== false,
    // Added after the first backup version — missing means "leave the
    // original default", not "this file is invalid".
    restTimerNotificationsEnabled: raw.restTimerNotificationsEnabled !== false,
    appleHealthImportNotificationsEnabled:
      raw.appleHealthImportNotificationsEnabled === true,
  };
}

/**
 * Lift the shareable part of a backup into a portable bundle so the web
 * importer (and the iOS template importer) can accept an iOS backup file.
 *
 * Workout history stays on the phone: Convex import is templates + custom
 * lifts + notes, the same surface as a web "Export all".
 */
export function bundleFromBackup(
  snapshot: WorkoutBackupSnapshot,
): WorkoutExportBundle {
  const namesBySlug = new Map<string, string>();
  for (const exercise of snapshot.customExercises) {
    namesBySlug.set(exercise.slug, exercise.name);
  }

  const notesBySlug = new Map<string, string>();
  for (const note of snapshot.exerciseNotes) {
    const trimmed = note.notes.trim();
    if (trimmed) notesBySlug.set(note.slug, note.notes);
  }

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: snapshot.createdAt,
    unit: snapshot.preferences.unit,
    templates: snapshot.templates.map((template) => ({
      name: template.name,
      exercises: template.exercises.map((exercise) => ({
        slug: exercise.slug,
        name: namesBySlug.get(exercise.slug) ?? exercise.slug,
        sets: exercise.sets.map((set) => ({
          weight: set.weight,
          reps: set.reps,
        })),
        ...(notesBySlug.get(exercise.slug)
          ? { notes: notesBySlug.get(exercise.slug) }
          : {}),
      })),
    })),
    customExercises: snapshot.customExercises.map((exercise) => ({
      slug: exercise.slug,
      name: exercise.name,
      category: exercise.category,
      usesBar: exercise.usesBar,
      ...(exercise.short?.trim() ? { short: exercise.short } : {}),
    })),
  };
}

/**
 * Parse whatever the user pasted or picked: a portable bundle (web or iOS
 * template export, file or WKT1 code) or an iOS backup. Backups become a
 * portable bundle of their templates so the same Import button works on both
 * apps. Workout history in a backup is left for Restore on iOS.
 */
export function parseImportedFile(input: string): ParseResult {
  const text = stripBom(input).trim();
  if (!text)
    return { ok: false, error: "Paste an export code or choose a file" };

  if (text.startsWith(CODE_PREFIX)) return parseBundle(text);
  // Backups can be tens of megabytes; template exports are tiny. Cap at the
  // backup ceiling so a phone snapshot isn't rejected before we can detect it.
  if (text.length > 32_000_000)
    return { ok: false, error: "That export is too large to import" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return parseBundle(text);
  }

  if (isRecord(parsed) && parsed.format === BACKUP_FORMAT) {
    const backup = validateBackup(parsed);
    if (!backup.ok) return { ok: false, error: backup.error };
    const bundle = bundleFromBackup(backup.snapshot);
    if (bundle.templates.length === 0) {
      return {
        ok: false,
        error: "That backup has no templates to import — restore it on iOS",
      };
    }
    return { ok: true, bundle };
  }

  return parseBundle(text);
}
