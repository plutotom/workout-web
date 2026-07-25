import {
  APICallError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoSuchModelError,
} from "ai";
import {
  GatewayAuthenticationError,
  GatewayModelNotFoundError,
  GatewayRateLimitError,
} from "@ai-sdk/gateway";

export type ModelGenerateFailure = {
  error: string;
  code: string;
  hint: string;
};

/**
 * Map AI Gateway / generateObject failures into user-facing copy.
 * Logs stay detailed; the client only gets actionable language.
 */
export function describeModelGenerateFailure(
  error: unknown,
  kind: "template" | "exercises",
): ModelGenerateFailure {
  const noun = kind === "template" ? "a template" : "exercises";

  if (
    GatewayAuthenticationError.isInstance(error) ||
    LoadAPIKeyError.isInstance(error)
  ) {
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_GATEWAY_AUTH",
      hint: "AI Gateway isn't configured (missing API key). Check AI_GATEWAY_API_KEY on Vercel.",
    };
  }

  if (
    GatewayModelNotFoundError.isInstance(error) ||
    NoSuchModelError.isInstance(error)
  ) {
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_MODEL_NOT_FOUND",
      hint: "The configured AI model isn't available. Check AI_GATEWAY_MODEL.",
    };
  }

  if (GatewayRateLimitError.isInstance(error)) {
    return {
      error: "AI provider rate limit hit",
      code: "AI_PROVIDER_RATE_LIMITED",
      hint: "The model provider is throttling requests. Wait a minute and try again.",
    };
  }

  if (NoObjectGeneratedError.isInstance(error)) {
    const cause =
      error.cause instanceof Error
        ? error.cause.message
        : typeof error.cause === "string"
          ? error.cause
          : undefined;
    const looksLikeSchema =
      cause?.toLowerCase().includes("validat") ||
      cause?.toLowerCase().includes("type") ||
      error.message.toLowerCase().includes("validat");

    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_INVALID_OUTPUT",
      hint: looksLikeSchema
        ? "The model returned an invalid workout shape. Try a shorter, more specific prompt."
        : "The model didn't return a usable workout. Try again with a clearer prompt.",
    };
  }

  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return {
        error: `Couldn't generate ${noun}`,
        code: "AI_GATEWAY_AUTH",
        hint: "AI Gateway rejected the request. Check AI_GATEWAY_API_KEY on Vercel.",
      };
    }
    if (error.statusCode === 429) {
      return {
        error: "AI provider rate limit hit",
        code: "AI_PROVIDER_RATE_LIMITED",
        hint: "The model provider is throttling requests. Wait a minute and try again.",
      };
    }
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_PROVIDER_ERROR",
      hint: `The model provider returned ${error.statusCode ?? "an error"}. Try again in a moment.`,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/api key|auth|unauthorized/i.test(message)) {
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_GATEWAY_AUTH",
      hint: "AI Gateway isn't configured (missing API key). Check AI_GATEWAY_API_KEY on Vercel.",
    };
  }

  return {
    error: `Couldn't generate ${noun}. Try again.`,
    code: "AI_GENERATE_FAILED",
    hint: "The model request failed. Try a simpler prompt, or retry in a moment.",
  };
}
