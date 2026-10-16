export type PermanentTemplateSyncFailure = {
  kind: "permanent";
  code: "template_limit";
  message: string;
};

export type TemplateSyncFailure =
  | PermanentTemplateSyncFailure
  | { kind: "retryable" };

export type CloudTemplateRef = {
  remoteId: string;
  name: string;
  exercises: Array<{
    slug: string;
    sets?: Array<{ weight: number; reps: number }>;
  }>;
};

/** Substring of the Convex createTemplate rejection (`…templates are allowed`). */
const TEMPLATE_LIMIT_NEEDLE = "At most 100 templates";
const TEMPLATE_LIMIT_MESSAGE = "At most 100 templates are allowed";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function templateNameKey(name: string) {
  return name.trim().toLowerCase();
}

function templateContentKey(exercises: CloudTemplateRef["exercises"]) {
  if (!exercises.length || exercises.some((exercise) => !exercise.sets))
    return null;
  return JSON.stringify(exercises.map(({ slug, sets }) => ({ slug, sets })));
}

/**
 * If this unsynced local template is already on the account, reuse that row
 * instead of creating a twin. A name alone never establishes identity: the
 * complete ordered prescriptions must match, and the match must be unique.
 */
export function adoptCloudTemplateId(
  local: { name: string; exercises: CloudTemplateRef["exercises"] },
  cloud: CloudTemplateRef[],
): string | null {
  const name = templateNameKey(local.name);
  if (!name) return null;
  const named = cloud.filter(
    (template) => templateNameKey(template.name) === name,
  );
  const content = templateContentKey(local.exercises);
  if (content === null) return null;
  const signed = named.filter(
    (template) => templateContentKey(template.exercises) === content,
  );
  if (signed.length === 1) return signed[0]?.remoteId ?? null;
  return null;
}

/** Keep unknown failures retryable; only classify explicit server rejections. */
export function classifyTemplateSyncFailure(
  error: unknown,
): TemplateSyncFailure {
  if (errorMessage(error).includes(TEMPLATE_LIMIT_NEEDLE)) {
    return {
      kind: "permanent",
      code: "template_limit",
      message: TEMPLATE_LIMIT_MESSAGE,
    };
  }

  return { kind: "retryable" };
}
