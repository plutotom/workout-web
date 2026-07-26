import { describe, expect, it } from "vitest";
import { zodSchema } from "ai";

import {
  assertOpenAiStrictJsonSchema,
  collectOpenAiStrictSchemaIssues,
  type JsonSchemaNode,
} from "./openai-strict-schema";
import { sessionDraftSchema } from "./session-draft";
import { templateDraftSchema } from "./template-draft";

describe("OpenAI strict JSON Schema for AI drafts", () => {
  it("session draft schema satisfies strict object rules", () => {
    const json = zodSchema(sessionDraftSchema).jsonSchema as JsonSchemaNode;
    expect(collectOpenAiStrictSchemaIssues(json)).toEqual([]);
    assertOpenAiStrictJsonSchema(json, "SessionReshapeDraft");
  });

  it("template draft schema satisfies strict object rules", () => {
    const json = zodSchema(templateDraftSchema).jsonSchema as JsonSchemaNode;
    expect(collectOpenAiStrictSchemaIssues(json)).toEqual([]);
    assertOpenAiStrictJsonSchema(json, "WorkoutTemplate");
  });

  it("flags schemas that omit required keys (the Gateway failure mode)", () => {
    const broken: JsonSchemaNode = {
      type: "object",
      properties: {
        removeSlugs: { type: "array" },
        add: { type: "array" },
      },
      // Simulate Zod `.default([])` omitting keys from required:
      required: [],
      additionalProperties: false,
    };
    expect(collectOpenAiStrictSchemaIssues(broken)).toEqual([
      "$: required must include every property key (missing: removeSlugs, add)",
    ]);
  });
});
