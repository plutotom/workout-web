import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_GATEWAY_MODEL,
  resolveAiGatewayModel,
} from "./resolve-model";

describe("resolveAiGatewayModel", () => {
  it("defaults to a structured-output capable OpenAI model", () => {
    expect(resolveAiGatewayModel({})).toBe(DEFAULT_AI_GATEWAY_MODEL);
    expect(DEFAULT_AI_GATEWAY_MODEL).toMatch(/^openai\//);
  });

  it("uses AI_GATEWAY_MODEL when set", () => {
    expect(
      resolveAiGatewayModel({ AI_GATEWAY_MODEL: " openai/gpt-4.1 " }),
    ).toBe("openai/gpt-4.1");
  });

  it("ignores blank overrides", () => {
    expect(resolveAiGatewayModel({ AI_GATEWAY_MODEL: "   " })).toBe(
      DEFAULT_AI_GATEWAY_MODEL,
    );
  });
});
