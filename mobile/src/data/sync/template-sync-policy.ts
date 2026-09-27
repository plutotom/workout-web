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
  exercises: Array<{ slug: string }>;
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

function templateSlugKey(exercises: Array<{ slug: string }>) {
  return exercises.map((exercise) => exercise.slug).join("\0");
}

/**
 * If this unsynced local template is already on the account, reuse that row
 * instead of creating a twin. Unique name wins; otherwise name+slug sequence.
 */
export function adoptCloudTemplateId(
  local: { name: string; exercises: Array<{ slug: string }> },
  cloud: CloudTemplateRef[],
): string | null {
  const name = templateNameKey(local.name);
  if (!name) return null;
  const named = cloud.filter(
    (template) => templateNameKey(template.name) === name,
  );
  if (named.length === 1) return named[0]?.remoteId ?? null;
  const slugs = templateSlugKey(local.exercises);
  const signed = named.filter(
    (template) => templateSlugKey(template.exercises) === slugs,
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
