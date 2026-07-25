import { generateObject, type FlexibleSchema } from "ai";

import { resolveAiGatewayModel } from "./resolve-model";

export type GenerateStructuredOptions<T> = {
  schema: FlexibleSchema<T>;
  schemaName: string;
  schemaDescription: string;
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Override model; defaults to `resolveAiGatewayModel()`. */
  model?: string;
};

/**
 * Structured object generation for AI Gateway models.
 *
 * Uses `generateObject` (deprecated but working) instead of
 * `generateText` + `Output.object()`. With Gateway, `generateText` often
 * leaves `finishReason` unset / non-`stop`, so accessing `result.output`
 * throws `AI_NoOutputGeneratedError` even when valid JSON is in `text`
 * (vercel/ai#11348). Keep schemas OpenAI-strict; switch back when that
 * path is reliable on Gateway.
 */
export async function generateStructuredObject<T>(
  options: GenerateStructuredOptions<T>,
): Promise<T> {
  const model = options.model ?? resolveAiGatewayModel();
  const { object } = await generateObject({
    model,
    schema: options.schema,
    schemaName: options.schemaName,
    schemaDescription: options.schemaDescription,
    system: options.system,
    prompt: options.prompt,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
  });
  return object;
}
