/** Format a short human wait label from milliseconds. */
export function formatRetryAfter(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) {
    return seconds === 1 ? "1 second" : `${seconds} seconds`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export type AiRateLimitScope = "minute" | "day";

export type AiRateLimitInput = {
  scope: AiRateLimitScope;
  limit: number;
  retryAfterMs: number;
};

export type AiRateLimitPayload = {
  error: string;
  code: "AI_RATE_LIMITED";
  scope: AiRateLimitScope;
  hint: string;
  retryAfterMs: number;
};

/** User-facing copy when AI generation is rate-limited. */
export function aiRateLimitFeedback(
  data: AiRateLimitInput,
): AiRateLimitPayload {
  const wait = formatRetryAfter(data.retryAfterMs);
  if (data.scope === "minute") {
    return {
      error: "Too many AI generations right now",
      code: "AI_RATE_LIMITED",
      scope: "minute",
      hint: `Limit is ${data.limit} per minute. Try again in ${wait}.`,
      retryAfterMs: data.retryAfterMs,
    };
  }
  return {
    error: "Daily AI limit reached",
    code: "AI_RATE_LIMITED",
    scope: "day",
    hint: `Limit is ${data.limit} generations per day. Try again in ${wait}.`,
    retryAfterMs: data.retryAfterMs,
  };
}

export type AiGenerateErrorPayload = {
  error?: string;
  code?: string;
  hint?: string;
};

/** Toast / inline copy for failed AI generate responses. */
export function describeAiGenerateFailure(
  data: AiGenerateErrorPayload,
  fallback: string,
): { title: string; description?: string } {
  if (data.code === "PRO_REQUIRED") {
    return {
      title: data.error ?? "AI generation requires Pro",
      description: "Upgrade in Settings to unlock Describe with AI.",
    };
  }
  if (data.code === "AI_RATE_LIMITED") {
    return {
      title: data.error ?? "AI rate limit reached",
      description: data.hint,
    };
  }
  if (data.error) {
    return {
      title: data.error,
      description: data.hint,
    };
  }
  return { title: fallback };
}
