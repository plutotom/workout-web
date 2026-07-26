import { describe, expect, it } from "vitest";

import {
  AI_MAX_EXERCISES,
  AI_MAX_PROMPT_CHARS,
  AI_MAX_SETS,
  AI_MAX_SLUG_CHARS,
  AI_MAX_TEMPLATE_NAME_CHARS,
  SESSION_BODY_LIMIT_BYTES,
  sessionRequestSchema,
  TEMPLATE_BODY_LIMIT_BYTES,
  templateRequestSchema,
} from "./request-schemas";

/** Every field at the maximum its schema allows, so the body is as big as legal. */
const maxPrompt = "x".repeat(AI_MAX_PROMPT_CHARS);
const maxSlug = "s".repeat(AI_MAX_SLUG_CHARS);

const worstCaseSession = {
  prompt: maxPrompt,
  current: {
    exercises: Array.from({ length: AI_MAX_EXERCISES }, () => ({
      slug: maxSlug,
      done: AI_MAX_SETS,
      total: AI_MAX_SETS,
    })),
  },
};

const worstCaseTemplate = {
  prompt: maxPrompt,
  mode: "edit" as const,
  current: {
    name: "n".repeat(AI_MAX_TEMPLATE_NAME_CHARS),
    exercises: Array.from({ length: AI_MAX_EXERCISES }, () => ({
      slug: maxSlug,
      sets: Array.from({ length: AI_MAX_SETS }, () => ({
        weight: 10_000,
        reps: 1_000,
      })),
    })),
  },
};

const byteLength = (body: unknown) =>
  new TextEncoder().encode(JSON.stringify(body)).byteLength;

describe("AI request byte caps", () => {
  /**
   * The bug this guards: a body the schema accepts but `parseBoundedJson`
   * rejects returns a 413 the user cannot act on, because nothing they can
   * change about their workout makes it smaller.
   */
  it("accepts the largest legal session body within the cap", () => {
    expect(sessionRequestSchema.safeParse(worstCaseSession).success).toBe(true);
    expect(byteLength(worstCaseSession)).toBeLessThan(SESSION_BODY_LIMIT_BYTES);
  });

  it("accepts the largest legal template body within the cap", () => {
    expect(templateRequestSchema.safeParse(worstCaseTemplate).success).toBe(
      true,
    );
    expect(byteLength(worstCaseTemplate)).toBeLessThan(
      TEMPLATE_BODY_LIMIT_BYTES,
    );
  });
});

describe("sessionRequestSchema", () => {
  it("rejects a completed count above the set total", () => {
    const result = sessionRequestSchema.safeParse({
      prompt: "go",
      current: { exercises: [{ slug: "bench-press", done: 4, total: 3 }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects more exercises than the schema allows", () => {
    const result = sessionRequestSchema.safeParse({
      prompt: "go",
      current: {
        exercises: Array.from({ length: AI_MAX_EXERCISES + 1 }, () => ({
          slug: "bench-press",
          done: 0,
          total: 1,
        })),
      },
    });
    expect(result.success).toBe(false);
  });
});
