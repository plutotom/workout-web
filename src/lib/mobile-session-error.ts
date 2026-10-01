function errorText(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; message?: unknown };
    return `${String(record.code ?? "")} ${String(record.message ?? "")}`;
  }
  return String(error ?? "");
}

function errorStatus(error: unknown) {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === "number" && Number.isFinite(status)) return status;
  }
  return null;
}

function errorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code.toLowerCase();
  }
  return "";
}

/**
 * 401 only for a sealed session we cannot read or a refresh token WorkOS
 * rejected. Timeouts, 5xx, and config/network blips stay retryable (503) so a
 * Convex reconnect cannot wipe the native session.
 */
export function mobileSessionErrorStatus(error: unknown): 401 | 503 {
  const status = errorStatus(error);
  if (status === 400 || status === 401 || status === 403) return 401;
  if (status === 408 || status === 429 || (status !== null && status >= 500)) {
    return 503;
  }

  const code = errorCode(error);
  if (
    code === "invalid_grant" ||
    code === "invalid_refresh_token" ||
    code === "invalid_session" ||
    code === "unseal" ||
    code.includes("expired")
  ) {
    return 401;
  }

  const text = errorText(error).toLowerCase();
  if (
    text.includes("unable to decrypt") ||
    text.includes("failed to decrypt") ||
    text.includes("unseal") ||
    text.includes("invalid refresh") ||
    text.includes("expired refresh") ||
    text.includes("invalid_grant") ||
    text.includes("invalid session")
  ) {
    return 401;
  }

  return 503;
}
