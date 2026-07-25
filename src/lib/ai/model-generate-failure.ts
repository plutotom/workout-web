import {
  AISDKError,
  APICallError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoSuchModelError,
  RetryError,
} from "ai";
import {
  GatewayAuthenticationError,
  GatewayError,
  GatewayFailedDependencyError,
  GatewayModelNotFoundError,
  GatewayRateLimitError,
} from "@ai-sdk/gateway";

export type ModelGenerateFailure = {
  error: string;
  code: string;
  hint: string;
};

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "").trim();
}

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  if (error instanceof Error && error.constructor?.name) {
    return error.constructor.name;
  }
  return "Error";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return stripAnsi(error.message);
  return stripAnsi(String(error));
}

/** Walk RetryError chains to the most specific failure. */
export function unwrapModelError(error: unknown): unknown {
  let current = error;
  for (let i = 0; i < 4; i++) {
    if (RetryError.isInstance(current) && current.lastError !== undefined) {
      current = current.lastError;
      continue;
    }
    break;
  }
  return current;
}

function matchesName(error: unknown, names: string[]): boolean {
  const name = errorName(error).toLowerCase();
  return names.some((n) => name === n.toLowerCase());
}

/**
 * Map AI Gateway / generateObject failures into user-facing copy.
 * Prefer marker checks, then fall back to error.name / message so bundled
 * duplicate package copies still surface useful feedback.
 */
export function describeModelGenerateFailure(
  error: unknown,
  kind: "template" | "exercises",
): ModelGenerateFailure {
  const noun = kind === "template" ? "a template" : "exercises";
  const root = unwrapModelError(error);
  const message = errorMessage(root);
  const name = errorName(root);
  const detail = message
    ? `${name}: ${message}`.replace(/\s+/g, " ").slice(0, 180)
    : name;

  if (
    GatewayAuthenticationError.isInstance(root) ||
    LoadAPIKeyError.isInstance(root) ||
    matchesName(root, [
      "GatewayAuthenticationError",
      "LoadAPIKeyError",
      "AuthenticationError",
    ]) ||
    /unauthenticated|api key|ai_gateway_api_key|unauthorized|oidc/i.test(
      message,
    )
  ) {
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_GATEWAY_AUTH",
      hint: "AI Gateway auth failed. Set AI_GATEWAY_API_KEY on Vercel (Production).",
    };
  }

  if (
    GatewayFailedDependencyError.isInstance(root) ||
    matchesName(root, ["GatewayFailedDependencyError"]) ||
    /failed.?dependency|provider.*not.*configured|no.*credentials/i.test(
      message,
    )
  ) {
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_PROVIDER_UNAVAILABLE",
      hint: "That model isn't available on your AI Gateway credits/providers. Check the model id or Gateway providers.",
    };
  }

  if (
    GatewayModelNotFoundError.isInstance(root) ||
    NoSuchModelError.isInstance(root) ||
    matchesName(root, ["GatewayModelNotFoundError", "NoSuchModelError"]) ||
    /model.*not.*found|unknown model/i.test(message)
  ) {
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_MODEL_NOT_FOUND",
      hint: "The configured AI model isn't available. Check AI_GATEWAY_MODEL on Vercel.",
    };
  }

  if (
    GatewayRateLimitError.isInstance(root) ||
    matchesName(root, ["GatewayRateLimitError"]) ||
    /rate limit|too many requests/i.test(message)
  ) {
    return {
      error: "AI provider rate limit hit",
      code: "AI_PROVIDER_RATE_LIMITED",
      hint: "The model provider is throttling requests. Wait a minute and try again.",
    };
  }

  if (
    NoObjectGeneratedError.isInstance(root) ||
    matchesName(root, ["NoObjectGeneratedError"])
  ) {
    const noObject = NoObjectGeneratedError.isInstance(root) ? root : null;
    const causeMessage =
      noObject?.cause instanceof Error
        ? stripAnsi(noObject.cause.message)
        : typeof noObject?.cause === "string"
          ? stripAnsi(noObject.cause)
          : undefined;
    const looksLikeSchema =
      causeMessage?.toLowerCase().includes("validat") ||
      causeMessage?.toLowerCase().includes("type") ||
      message.toLowerCase().includes("validat");

    if (noObject?.finishReason === "length") {
      return {
        error: `Couldn't generate ${noun}`,
        code: "AI_OUTPUT_TRUNCATED",
        hint: "The model response was cut off. Ask for fewer exercises or a shorter session.",
      };
    }

    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_INVALID_OUTPUT",
      hint: looksLikeSchema
        ? `Invalid workout shape from the model. ${detail}`
        : `Model returned unusable output. ${detail}`,
    };
  }

  if (APICallError.isInstance(root) || matchesName(root, ["APICallError"])) {
    const status = APICallError.isInstance(root) ? root.statusCode : undefined;
    if (status === 401 || status === 403) {
      return {
        error: `Couldn't generate ${noun}`,
        code: "AI_GATEWAY_AUTH",
        hint: "AI Gateway rejected the request. Check AI_GATEWAY_API_KEY on Vercel.",
      };
    }
    if (status === 429) {
      return {
        error: "AI provider rate limit hit",
        code: "AI_PROVIDER_RATE_LIMITED",
        hint: "The model provider is throttling requests. Wait a minute and try again.",
      };
    }
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_PROVIDER_ERROR",
      hint: status
        ? `Provider error ${status}. ${detail}`
        : `Provider error. ${detail}`,
    };
  }

  if (
    GatewayError.isInstance(root) ||
    matchesName(root, [
      "GatewayError",
      "GatewayInternalServerError",
      "GatewayInvalidRequestError",
      "GatewayResponseError",
      "GatewayForbiddenError",
    ])
  ) {
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_GATEWAY_ERROR",
      hint: `AI Gateway error. ${detail}`,
    };
  }

  if (AISDKError.isInstance(root) || matchesName(root, ["AISDKError"])) {
    return {
      error: `Couldn't generate ${noun}`,
      code: "AI_SDK_ERROR",
      hint: `AI SDK error. ${detail}`,
    };
  }

  return {
    error: `Couldn't generate ${noun}. Try again.`,
    code: "AI_GENERATE_FAILED",
    hint:
      detail ||
      "The model request failed. Try a simpler prompt, or retry in a moment.",
  };
}
