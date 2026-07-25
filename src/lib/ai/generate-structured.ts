import { generateText, Output, type FlexibleSchema } from "ai";

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
 * Structured object generation via AI SDK 7 (`generateText` + `Output.object`).
 *
 * Prefer this over deprecated `generateObject`. Pass a Gateway model string
 * (`openai/...`) so the SDK routes through Vercel AI Gateway automatically.
 */
export async function generateStructuredObject<T>(
  options: GenerateStructuredOptions<T>,
): Promise<T> {
  const model = options.model ?? resolveAiGatewayModel();
  const { output } = await generateText({
    model,
    output: Output.object({
      name: options.schemaName,
      description: options.schemaDescription,
      schema: options.schema,
    }),
    system: options.system,
    prompt: options.prompt,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
  });

  if (output == null) {
    throw new Error("Model returned no structured output");
  }

  return output;
}
