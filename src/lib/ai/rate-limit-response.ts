import { ConvexError } from "convex/values";

import {
  aiRateLimitFeedback,
  type AiRateLimitPayload,
} from "@/lib/ai/generate-feedback";

type RateLimitData = {
  code: string;
  scope: "minute" | "day";
  limit: number;
  retryAfterMs: number;
};

function isAiRateLimitData(data: unknown): data is RateLimitData {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  return (
    record.code === "AI_RATE_LIMITED" &&
    (record.scope === "minute" || record.scope === "day") &&
    typeof record.limit === "number" &&
    typeof record.retryAfterMs === "number"
  );
}

/**
 * Map a Convex mutation failure into a structured AI rate-limit payload.
 * Prefers ConvexError.data (survives prod); falls back to message matching.
 */
export function aiRateLimitFromUnknown(
  error: unknown,
): AiRateLimitPayload | null {
  if (error instanceof ConvexError && isAiRateLimitData(error.data)) {
    return aiRateLimitFeedback(error.data);
  }

  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("AI_RATE_LIMITED")) return null;

  // Legacy / sanitized errors: assume the tighter minute window.
  return aiRateLimitFeedback({
    scope: "minute",
    limit: 5,
    retryAfterMs: 60_000,
  });
}
