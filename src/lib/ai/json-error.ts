export type AiJsonErrorExtras = {
  code?: string;
  hint?: string;
  retryAfterMs?: number;
};

/** Shared JSON error responses for AI route handlers. */
export function aiJsonError(
  status: number,
  error: string,
  extras?: AiJsonErrorExtras,
): Response {
  return Response.json(
    {
      error,
      code: extras?.code,
      hint: extras?.hint,
      retryAfterMs: extras?.retryAfterMs,
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
