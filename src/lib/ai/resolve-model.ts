/** Default: small OpenAI model with reliable structured outputs via Gateway. */
export const DEFAULT_AI_GATEWAY_MODEL = "openai/gpt-4.1-mini";

type AiGatewayModelEnv = {
  AI_GATEWAY_MODEL?: string;
};

/**
 * Resolve the AI Gateway model id (`provider/model`).
 * Override with `AI_GATEWAY_MODEL` on Vercel / local env.
 */
export function resolveAiGatewayModel(
  env: AiGatewayModelEnv = {
    AI_GATEWAY_MODEL: process.env.AI_GATEWAY_MODEL,
  },
): string {
  const configured = env.AI_GATEWAY_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_AI_GATEWAY_MODEL;
}
