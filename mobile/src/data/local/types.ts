export type LocalId = string;
export type LocalSessionStatus = "in_progress" | "completed" | "abandoned";

export type LocalWorkoutSet = {
  _id: LocalId;
  sessionExerciseId: LocalId;
  orderIndex: number;
  targetWeight: number;
  targetReps: number;
  weight: number;
  reps: number;
  completed: boolean;
  completedAt?: number;
};

export type LocalWorkoutExercise = {
  _id: LocalId;
  sessionId: LocalId;
  slug: string;
  orderIndex: number;
  restSeconds: number;
  notes?: string;
  sets: LocalWorkoutSet[];
};

export type LocalWorkoutSession = {
  _id: LocalId;
  remoteId: string | null;
  remoteTemplateId: string | null;
  status: LocalSessionStatus;
  templateId: LocalId | null;
  templateName: string;
  startedAt: number;
  completedAt?: number;
  updatedAt: number;
  exercises: LocalWorkoutExercise[];
};

export type LocalActiveWorkout = {
  _id: LocalId;
  templateId: LocalId | null;
  templateName: string;
  startedAt: number;
};

export type LocalTemplateSet = {
  weight: number;
  reps: number;
};

export type LocalTemplateExercise = {
  slug: string;
  orderIndex: number;
  sets: LocalTemplateSet[];
};

export type LocalTemplate = {
  _id: LocalId;
  remoteId: string;
  name: string;
  updatedAt: number;
  exercises: LocalTemplateExercise[];
};

/** Unsynced phone-only templates use this remote id prefix until Convex create succeeds. */
export const LOCAL_TEMPLATE_REMOTE_PREFIX = "local:";

export function isUnsyncedTemplateRemoteId(remoteId: string) {
  return remoteId.startsWith(LOCAL_TEMPLATE_REMOTE_PREFIX);
}

export function localTemplateRemoteId(templateId: string) {
  return `${LOCAL_TEMPLATE_REMOTE_PREFIX}${templateId}`;
}

export type LocalMuscleGroup =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "core";

export type LocalCustomExercise = {
  _id: LocalId;
  slug: string;
  remoteId: string | null;
  name: string;
  short: string | null;
  category: LocalMuscleGroup;
  usesBar: boolean;
  archived: boolean;
  updatedAt: number;
};

/**
 * Slug prefix for a custom lift created offline. Convex-backed lifts use
 * `custom:<documentId>`; until the upload lands we mint `custom:local-<uuid>`
 * so templates, sessions and notes have something stable to reference.
 */
export const LOCAL_CUSTOM_SLUG_PREFIX = "custom:local-";

export function localCustomSlug(exerciseId: string) {
  return `${LOCAL_CUSTOM_SLUG_PREFIX}${exerciseId}`;
}

export function remoteCustomSlug(remoteId: string) {
  return `custom:${remoteId}`;
}

export type CustomExerciseSyncSnapshot = {
  clientId: string;
  name: string;
  short: string | null;
  category: LocalMuscleGroup;
  usesBar: boolean;
  archived: boolean;
};

export type PendingCustomExerciseSync = {
  operationId: string;
  exerciseId: string;
  snapshot: CustomExerciseSyncSnapshot;
  createdAt: number;
  attemptCount: number;
};

export type LocalPreferences = {
  unit: "lb" | "kg";
  barWeightLb: number;
  barWeightKg: number;
  activeWorkoutMode: "list" | "focus";
  restTimerEnabled: boolean;
};

export type IosBootstrapPayload = {
  serverTime: number;
  preferences: {
    unit: "lb" | "kg";
    barWeightLb: number | null;
    barWeightKg: number | null;
    activeWorkoutMode: "list" | "focus";
    restTimerEnabled: boolean;
  };
  templates: Array<{
    remoteId: string;
    name: string;
    updatedAt: number;
    exercises: LocalTemplateExercise[];
  }>;
  customExercises: Array<{
    remoteId: string;
    clientId: string | null;
    name: string;
    short: string | null;
    category: string;
    usesBar: boolean;
    archived: boolean;
  }>;
  exerciseNotes: Array<{
    slug: string;
    notes: string;
  }>;
};

export type SessionSyncSnapshot = {
  clientId: string;
  remoteTemplateId: string | null;
  templateName: string;
  status: LocalSessionStatus;
  startedAt: number;
  completedAt: number | null;
  updatedAt: number;
  exercises: Array<{
    clientId: string;
    slug: string;
    orderIndex: number;
    restSeconds: number;
    notes: string | null;
    sets: Array<{
      clientId: string;
      orderIndex: number;
      targetWeight: number;
      targetReps: number;
      weight: number;
      reps: number;
      completed: boolean;
      completedAt: number | null;
    }>;
  }>;
};

export type PendingSessionSync = {
  operationId: string;
  sessionId: string;
  snapshot: SessionSyncSnapshot;
  createdAt: number;
  attemptCount: number;
};
