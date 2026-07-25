import type { ConvexHttpClient } from "convex/browser";

import { api } from "@backend/api";
import type { AiJsonErrorExtras } from "@/lib/ai/json-error";
import { aiRateLimitFromUnknown } from "@/lib/ai/rate-limit-response";

type JsonError = (
  status: number,
  error: string,
  extras?: AiJsonErrorExtras,
) => Response;

/** Charge one AI generation after a successful model response. */
export async function consumeAiGenerationOrError(
  convex: ConvexHttpClient,
  jsonError: JsonError,
): Promise<Response | null> {
  try {
    await convex.mutation(api.routes.ai.usage.consumeGeneration, {});
    return null;
  } catch (error) {
    const limited = aiRateLimitFromUnknown(error);
    if (limited) {
      return jsonError(429, limited.error, {
        code: limited.code,
        hint: limited.hint,
        retryAfterMs: limited.retryAfterMs,
      });
    }
    console.error("AI generation quota check failed", error);
    return jsonError(503, "Couldn't verify AI quota. Try again.", {
      hint: "Your account may still be loading. Wait a moment and retry.",
    });
  }
}
