import { describe, expect, it } from "vitest";
import { NoObjectGeneratedError } from "ai";
import { GatewayAuthenticationError } from "@ai-sdk/gateway";

import { describeModelGenerateFailure } from "./model-generate-failure";

describe("describeModelGenerateFailure", () => {
  it("maps gateway auth failures", () => {
    const error = new GatewayAuthenticationError({
      message: "Unauthorized",
      statusCode: 401,
    });
    expect(describeModelGenerateFailure(error, "exercises")).toMatchObject({
      code: "AI_GATEWAY_AUTH",
      hint: expect.stringContaining("AI_GATEWAY_API_KEY"),
    });
  });

  it("maps invalid structured output", () => {
    const error = new NoObjectGeneratedError({
      message: "No object generated: response did not match schema.",
      cause: new Error("Type validation failed"),
      text: "{}",
      response: {
        id: "x",
        timestamp: new Date(),
        modelId: "openai/gpt-5-nano",
        headers: undefined,
      },
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
      finishReason: "stop",
    });
    expect(describeModelGenerateFailure(error, "exercises")).toMatchObject({
      code: "AI_INVALID_OUTPUT",
      hint: expect.stringContaining("invalid workout shape"),
    });
  });
});
