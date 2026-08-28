import { describe, expect, it } from "vitest";

import {
  APPLE_INTELLIGENCE_CONTEXT_CODE,
  APPLE_ON_DEVICE_PROMPT_CHARS,
  assertApplePromptLength,
  buildOnDeviceSessionPrompt,
  buildOnDeviceTemplatePrompt,
  catalogExercisesForAi,
  estimateAppleTokens,
  fallbackAppleLanguageModel,
  generateWithAppleModelFallback,
  parseOnDeviceSessionDraft,
  parseOnDeviceTemplateDraft,
  pickAppleLanguageModel,
  shouldFallBackToApple,
  summarizeSessionForOnDevicePrompt,
  summarizeTemplateForOnDevicePrompt,
  appleAiUnavailableMessage,
} from "./apple-on-device";
import { ON_DEVICE_PROMPT_CATALOG_MAX } from "./template-draft";

const catalog = catalogExercisesForAi([
  { slug: "bench", name: "Bench Press", category: "chest" },
  { slug: "squat", name: "Squat", category: "legs" },
  { slug: "ohp", name: "Overhead Press", category: "shoulders" },
  { slug: "custom:abc", name: "My Lift", category: "arms", custom: true },
]);

const available = {
  onDevice: true,
  onDeviceReason: null,
  pcc: true,
  pccReason: null,
  onDeviceContextSize: 4096,
  pccContextSize: 32768,
  pccQuotaReached: false,
};

describe("pickAppleLanguageModel", () => {
  it("prefers on-device when the prompt fits", () => {
    expect(pickAppleLanguageModel(available, 1200)).toBe("onDevice");
  });

  it("uses PCC when on-device would overflow", () => {
    expect(pickAppleLanguageModel(available, 3800)).toBe("pcc");
  });

  it("returns tooLarge when on-device overflows and PCC is at quota", () => {
    expect(
      pickAppleLanguageModel({ ...available, pccQuotaReached: true }, 3800),
    ).toBe("tooLarge");
  });

  it("returns unavailable when Apple Intelligence is off", () => {
    expect(
      pickAppleLanguageModel(
        {
          ...available,
          onDevice: false,
          pcc: false,
          onDeviceReason: "appleIntelligenceNotEnabled",
        },
        200,
      ),
    ).toBe("unavailable");
  });
});

describe("fallbackAppleLanguageModel", () => {
  const overflow = Object.assign(new Error("too large for on-device AI"), {
    code: APPLE_INTELLIGENCE_CONTEXT_CODE,
  });

  it("overflows to PCC when on-device generate blows the context window", () => {
    expect(fallbackAppleLanguageModel("onDevice", overflow, available)).toBe(
      "pcc",
    );
  });

  it("does not retry PCC after a guardrail or generic failure", () => {
    expect(
      fallbackAppleLanguageModel(
        "onDevice",
        new Error("Apple Intelligence couldn’t generate that."),
        available,
      ),
    ).toBeNull();
  });

  it("does not retry when PCC is at quota or already in use", () => {
    expect(
      fallbackAppleLanguageModel("onDevice", overflow, {
        ...available,
        pccQuotaReached: true,
      }),
    ).toBeNull();
    expect(fallbackAppleLanguageModel("pcc", overflow, available)).toBeNull();
  });
});

describe("generateWithAppleModelFallback", () => {
  it("retries PCC after an on-device context overflow", async () => {
    const models: string[] = [];
    const result = await generateWithAppleModelFallback({
      availability: available,
      inputTokens: 1200,
      toUserError: (error) =>
        error instanceof Error ? error : new Error(String(error)),
      generate: async (model) => {
        models.push(model);
        if (model === "onDevice") {
          throw Object.assign(new Error("too large for on-device AI"), {
            code: APPLE_INTELLIGENCE_CONTEXT_CODE,
          });
        }
        return { model, draft: { name: "Push" } };
      },
    });
    expect(models).toEqual(["onDevice", "pcc"]);
    expect(result.model).toBe("pcc");
  });

  it("does not call PCC when the on-device error is not a context overflow", async () => {
    const models: string[] = [];
    await expect(
      generateWithAppleModelFallback({
        availability: available,
        inputTokens: 1200,
        toUserError: (error) =>
          error instanceof Error ? error : new Error(String(error)),
        generate: async (model) => {
          models.push(model);
          throw new Error("Couldn’t generate on this iPhone.");
        },
      }),
    ).rejects.toThrow(/Couldn’t generate/);
    expect(models).toEqual(["onDevice"]);
  });
});

describe("appleAiUnavailableMessage", () => {
  it("points at Settings when Intelligence is disabled", () => {
    expect(
      appleAiUnavailableMessage(
        {
          ...available,
          onDevice: false,
          pcc: false,
          onDeviceReason: "appleIntelligenceNotEnabled",
        },
        "unavailable",
      ),
    ).toMatch(/Turn on Apple Intelligence/);
  });

  it("mentions the daily PCC cap when overflow is blocked", () => {
    expect(
      appleAiUnavailableMessage(
        { ...available, pccQuotaReached: true },
        "tooLarge",
      ),
    ).toMatch(/cloud limit/);
  });
});

describe("on-device prompts", () => {
  it("keeps create prompts well under the 4k window", () => {
    const built = buildOnDeviceTemplatePrompt({
      prompt: "Push day: bench, OHP, dips — 4x8",
      mode: "create",
      catalog,
    });
    const tokens = estimateAppleTokens(built.instructions + built.prompt);
    expect(tokens).toBeLessThan(2500);
    expect(built.prompt).toContain("bench | Bench Press");
    expect(built.prompt).not.toContain(" | chest");
    expect(built.allowedSlugs.has("custom:abc")).toBe(true);
  });

  it("summarizes the current template instead of dumping every set", () => {
    const summary = summarizeTemplateForOnDevicePrompt({
      name: "Push",
      exercises: [
        {
          slug: "bench",
          sets: Array.from({ length: 20 }, () => ({ weight: 225, reps: 5 })),
        },
      ],
    });
    expect(summary).toContain("1. bench (20 sets)");
    expect(summary).not.toContain("225");
  });

  it("summarizes session progress as done/total", () => {
    expect(
      summarizeSessionForOnDevicePrompt([{ slug: "squat", done: 2, total: 4 }]),
    ).toContain("1. squat (2/4 sets done)");
  });

  it("rejects oversized prompts before they hit the model", () => {
    expect(() =>
      assertApplePromptLength("x".repeat(APPLE_ON_DEVICE_PROMPT_CHARS + 1)),
    ).toThrow(/1200 characters/);
  });

  it("session prompt includes current slugs for removals", () => {
    const built = buildOnDeviceSessionPrompt({
      prompt: "Drop squat and add ohp",
      catalog,
      current: { exercises: [{ slug: "squat", done: 0, total: 3 }] },
    });
    expect(built.prompt).toContain("squat");
    expect(built.instructions).toContain("removeSlugs");
  });
});

describe("parseOnDevice drafts", () => {
  it("grounds template slugs against the catalog", () => {
    const { draft, droppedSlugs } = parseOnDeviceTemplateDraft(
      {
        name: "Push",
        exercises: [
          { slug: "bench", sets: [{ weight: 135.4, reps: 8 }] },
          { slug: "nope", sets: [{ weight: 0, reps: 10 }] },
        ],
      },
      new Set(["bench", "ohp"]),
    );
    expect(draft.exercises).toEqual([
      { slug: "bench", sets: [{ weight: 135, reps: 8 }] },
    ]);
    expect(droppedSlugs).toEqual(["nope"]);
  });

  it("grounds session removals to the current session", () => {
    const { draft } = parseOnDeviceSessionDraft(
      {
        removeSlugs: ["squat", "ghost"],
        add: [{ slug: "ohp", sets: [{ weight: 0, reps: 8 }] }],
      },
      new Set(["bench", "squat", "ohp"]),
      new Set(["bench", "squat"]),
    );
    expect(draft.removeSlugs).toEqual(["squat"]);
    expect(draft.add[0]?.slug).toBe("ohp");
  });
});

describe("shouldFallBackToApple", () => {
  it("retries on-device after a network or auth failure", () => {
    expect(shouldFallBackToApple(new Error("Sign in again to use AI"))).toBe(
      true,
    );
    expect(shouldFallBackToApple(new Error("AI generation failed"))).toBe(true);
  });

  it("does not retry after a client validation error", () => {
    expect(shouldFallBackToApple(new Error("Invalid request body"))).toBe(
      false,
    );
    expect(shouldFallBackToApple(new Error("Request body is too large"))).toBe(
      false,
    );
  });
});

describe("ON_DEVICE_PROMPT_CATALOG_MAX", () => {
  it("is half the cloud catalog so 4k has room for output", () => {
    expect(ON_DEVICE_PROMPT_CATALOG_MAX).toBe(48);
  });
});
