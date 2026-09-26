export type PermanentTemplateSyncFailure = {
  kind: "permanent";
  code: "template_limit";
  message: string;
};

export type TemplateSyncFailure =
  | PermanentTemplateSyncFailure
  | { kind: "retryable" };

/** Substring of the Convex createTemplate rejection (`…templates are allowed`). */
const TEMPLATE_LIMIT_NEEDLE = "At most 100 templates";
const TEMPLATE_LIMIT_MESSAGE = "At most 100 templates are allowed";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
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
