import {
  GENERATE_SYSTEM_PROMPT,
  ON_DEVICE_PROMPT_CATALOG_MAX,
  applyRequiredExercisesToTemplate,
  detectRequiredExerciseSlugs,
  formatCatalogForPrompt,
  formatRequiredExercisesPromptBlock,
  groundTemplateDraft,
  isExplicitExerciseList,
  padExerciseSets,
  selectCatalogForAiPrompt,
  templateDraftSchema,
  type CatalogExercise,
  type TemplateDraft,
} from "./template-draft";
import {
  SESSION_GENERATE_SYSTEM_PROMPT,
  applyRequiredExercisesToSession,
  groundSessionDraft,
  sessionDraftSchema,
  type SessionDraft,
} from "./session-draft";

export type { CatalogExercise, TemplateDraft } from "./template-draft";
export type { SessionDraft } from "./session-draft";

/** Apple on-device ~4k; leave room for guided-generation schema + JSON. */
export const APPLE_OUTPUT_TOKEN_HEADROOM = 600;
/** Keep the user prompt well under the web 2k cap so 4k still fits. */
export const APPLE_ON_DEVICE_PROMPT_CHARS = 1_200;

export type AppleLanguageModel = "onDevice" | "pcc";

/** Native `Exception.name` when guided generation blows the context window. */
export const APPLE_INTELLIGENCE_CONTEXT_CODE = "AppleIntelligenceContext";

export type AppleFoundationAvailability = {
  onDevice: boolean;
  onDeviceReason: string | null;
  pcc: boolean;
  pccReason: string | null;
  onDeviceContextSize: number;
  pccContextSize: number;
  pccQuotaReached: boolean;
};

export type AppleModelPick = AppleLanguageModel | "tooLarge" | "unavailable";

export const UNAVAILABLE_APPLE_FOUNDATION: AppleFoundationAvailability = {
  onDevice: false,
  onDeviceReason: "unsupported",
  pcc: false,
  pccReason: "unsupported",
  onDeviceContextSize: 0,
  pccContextSize: 0,
  pccQuotaReached: false,
};

/** ~3.5 Latin chars/token — slightly conservative vs Apple's 3–4 rule of thumb. */
export function estimateAppleTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function pickAppleLanguageModel(
  availability: AppleFoundationAvailability,
  inputTokens: number,
  outputHeadroom = APPLE_OUTPUT_TOKEN_HEADROOM,
): AppleModelPick {
  const needed = inputTokens + outputHeadroom;
  const onDeviceWindow = availability.onDeviceContextSize || 4096;
  if (availability.onDevice && needed <= onDeviceWindow) return "onDevice";

  const pccWindow = availability.pccContextSize || 32768;
  if (
    availability.pcc &&
    !availability.pccQuotaReached &&
    needed <= pccWindow
  ) {
    return "pcc";
  }

  if (availability.onDevice) return "tooLarge";
  return "unavailable";
}

function appleErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const record = error as { code?: unknown; name?: unknown };
  if (typeof record.code === "string" && record.code.trim()) return record.code;
  if (typeof record.name === "string") return record.name;
  return "";
}

function appleErrorMessageText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

/** On-device generate can still overflow after a token estimate that looked safe. */
export function isAppleContextOverflowError(error: unknown): boolean {
  const code = appleErrorCode(error).toLowerCase();
  if (code.includes("appleintelligencecontext")) return true;
  const message = appleErrorMessageText(error).toLowerCase();
  return (
    message.includes("too large for on-device") ||
    message.includes("too large for apple intelligence") ||
    message.includes("exceededcontextwindow") ||
    message.includes("contextsizeexceeded") ||
    message.includes("context window")
  );
}

/**
 * If on-device generation hits the 4k window, overflow to PCC when it is
 * available and under quota. Pre-flight routing already prefers PCC when the
 * *input* is too big; this covers schema + output that still blow the window.
 */
export function fallbackAppleLanguageModel(
  failedModel: AppleLanguageModel,
  error: unknown,
  availability: AppleFoundationAvailability,
): AppleLanguageModel | null {
  if (failedModel !== "onDevice") return null;
  if (!isAppleContextOverflowError(error)) return null;
  if (!availability.pcc || availability.pccQuotaReached) return null;
  return "pcc";
}

export async function generateWithAppleModelFallback<T>(options: {
  availability: AppleFoundationAvailability;
  inputTokens: number;
  generate: (model: AppleLanguageModel) => Promise<T>;
  toUserError: (error: unknown) => Error;
}): Promise<T> {
  const pick = pickAppleLanguageModel(
    options.availability,
    options.inputTokens,
  );
  if (pick === "tooLarge" || pick === "unavailable") {
    throw new Error(appleAiUnavailableMessage(options.availability, pick));
  }

  try {
    return await options.generate(pick);
  } catch (error) {
    const fallback = fallbackAppleLanguageModel(
      pick,
      error,
      options.availability,
    );
    if (!fallback) {
      if (isAppleContextOverflowError(error)) {
        throw new Error(
          appleAiUnavailableMessage(options.availability, "tooLarge"),
        );
      }
      throw options.toUserError(error);
    }
    try {
      return await options.generate(fallback);
    } catch (fallbackError) {
      if (isAppleContextOverflowError(fallbackError)) {
        throw new Error(
          appleAiUnavailableMessage(options.availability, "tooLarge"),
        );
      }
      throw options.toUserError(fallbackError);
    }
  }
}

export function appleAiUnavailableMessage(
  availability: AppleFoundationAvailability,
  pick: AppleModelPick,
): string {
  if (pick === "tooLarge") {
    if (availability.pccQuotaReached) {
      return "This request is too large for on-device AI, and today’s Apple Intelligence cloud limit is used up. Shorten the description or try tomorrow.";
    }
    return "This request is too large for on-device AI. Shorten the description and try again.";
  }

  const reason = availability.onDeviceReason ?? availability.pccReason;
  if (reason === "appleIntelligenceNotEnabled") {
    return "Turn on Apple Intelligence in Settings to generate workouts on this iPhone.";
  }
  if (reason === "modelNotReady" || reason === "systemNotReady") {
    return "Apple Intelligence is still downloading. Try again in a bit.";
  }
  if (reason === "deviceNotEligible") {
    return "Apple Intelligence isn’t available on this iPhone.";
  }
  return "AI generation isn’t available on this iPhone.";
}

/** Re-check while the on-device model is downloading; other reasons wait for foreground. */
export function nextAppleAvailabilityPollMs(
  availability: AppleFoundationAvailability,
): number | null {
  if (appleAiIsUsable(availability)) return null;
  const reasons = [availability.onDeviceReason, availability.pccReason];
  if (reasons.includes("modelNotReady") || reasons.includes("systemNotReady")) {
    return 8_000;
  }
  return null;
}

export function assertApplePromptLength(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe the workout first");
  if (trimmed.length > APPLE_ON_DEVICE_PROMPT_CHARS) {
    throw new Error(
      `Keep the description under ${APPLE_ON_DEVICE_PROMPT_CHARS} characters so it fits on this iPhone.`,
    );
  }
  return trimmed;
}

function customCatalog(catalog: CatalogExercise[]): CatalogExercise[] {
  return catalog.filter((exercise) => exercise.slug.startsWith("custom:"));
}

export function selectOnDeviceCatalog(options: {
  prompt: string;
  catalog: CatalogExercise[];
  mustIncludeSlugs?: Iterable<string>;
}): CatalogExercise[] {
  return selectCatalogForAiPrompt({
    prompt: options.prompt,
    customs: customCatalog(options.catalog),
    mustIncludeSlugs: options.mustIncludeSlugs,
    max: ON_DEVICE_PROMPT_CATALOG_MAX,
  });
}

export function summarizeTemplateForOnDevicePrompt(current: {
  name: string;
  exercises: { slug: string; sets: { weight: number; reps: number }[] }[];
}): string {
  if (current.exercises.length === 0) {
    return `Current template "${current.name}": empty.`;
  }
  const lines = current.exercises.map(
    (exercise, index) =>
      `${index + 1}. ${exercise.slug} (${exercise.sets.length} sets)`,
  );
  return `Current template "${current.name}":\n${lines.join("\n")}\nKeep exercises the user did not ask to change unless needed.`;
}

export function summarizeSessionForOnDevicePrompt(
  exercises: { slug: string; done: number; total: number }[],
): string {
  if (exercises.length === 0) {
    return "Current session: empty (no exercises yet).";
  }
  const lines = exercises.map(
    (exercise, index) =>
      `${index + 1}. ${exercise.slug} (${exercise.done}/${exercise.total} sets done)`,
  );
  return `Current session exercises (use these exact slugs in removeSlugs):\n${lines.join("\n")}`;
}

export function buildOnDeviceTemplatePrompt(options: {
  prompt: string;
  mode: "create" | "edit";
  catalog: CatalogExercise[];
  current?: {
    name: string;
    exercises: { slug: string; sets: { weight: number; reps: number }[] }[];
  };
}): {
  instructions: string;
  prompt: string;
  allowedSlugs: Set<string>;
  requiredSlugs: string[];
} {
  const userPrompt = assertApplePromptLength(options.prompt);
  const requiredSlugs = detectRequiredExerciseSlugs(
    userPrompt,
    options.catalog,
  );
  const mustInclude = [
    ...(options.current?.exercises.map((exercise) => exercise.slug) ?? []),
    ...requiredSlugs,
  ];
  const promptCatalog = selectOnDeviceCatalog({
    prompt: userPrompt,
    catalog: options.catalog,
    mustIncludeSlugs: mustInclude,
  });
  const parts = [`Mode: ${options.mode}`, `User request:\n${userPrompt}`];
  const requiredBlock = formatRequiredExercisesPromptBlock(
    requiredSlugs,
    options.catalog,
  );
  if (requiredBlock) parts.push(requiredBlock);
  if (options.mode === "edit" && options.current) {
    parts.push(summarizeTemplateForOnDevicePrompt(options.current));
  }
  parts.push(
    `Exercise catalog (slug | name). Use ONLY these slugs:\n${formatCatalogForPrompt(promptCatalog, "compact")}`,
  );
  return {
    instructions: GENERATE_SYSTEM_PROMPT,
    prompt: parts.join("\n\n"),
    allowedSlugs: new Set(options.catalog.map((exercise) => exercise.slug)),
    requiredSlugs,
  };
}

export function buildOnDeviceSessionPrompt(options: {
  prompt: string;
  catalog: CatalogExercise[];
  current: { exercises: { slug: string; done: number; total: number }[] };
}): {
  instructions: string;
  prompt: string;
  allowedSlugs: Set<string>;
  requiredSlugs: string[];
} {
  const userPrompt = assertApplePromptLength(options.prompt);
  const existingSlugs = options.current.exercises
    .map((exercise) => exercise.slug.trim())
    .filter(Boolean);
  const existingSet = new Set(existingSlugs);
  const requiredSlugs = detectRequiredExerciseSlugs(
    userPrompt,
    options.catalog,
  ).filter((slug) => !existingSet.has(slug));
  const promptCatalog = selectOnDeviceCatalog({
    prompt: userPrompt,
    catalog: options.catalog,
    mustIncludeSlugs: [...existingSlugs, ...requiredSlugs],
  });
  const parts = [
    summarizeSessionForOnDevicePrompt(options.current.exercises),
    `User request:\n${userPrompt}`,
  ];
  const requiredBlock = formatRequiredExercisesPromptBlock(
    requiredSlugs,
    options.catalog,
  );
  if (requiredBlock) parts.push(requiredBlock);
  parts.push(
    `Exercise catalog for add (slug | name):\n${formatCatalogForPrompt(promptCatalog, "compact")}`,
  );
  return {
    instructions: SESSION_GENERATE_SYSTEM_PROMPT,
    prompt: parts.join("\n\n"),
    allowedSlugs: new Set(options.catalog.map((exercise) => exercise.slug)),
    requiredSlugs,
  };
}

export function parseOnDeviceTemplateDraft(
  raw: unknown,
  allowedSlugs: Set<string>,
  options?: { prompt?: string; requiredSlugs?: string[] },
): { draft: TemplateDraft; droppedSlugs: string[] } {
  const parsed = templateDraftSchema.parse(raw);
  const { draft, droppedSlugs } = groundTemplateDraft(parsed, allowedSlugs);
  const requiredSlugs = options?.requiredSlugs ?? [];
  const merged = applyRequiredExercisesToTemplate(draft, requiredSlugs, {
    strictList: isExplicitExerciseList(
      options?.prompt ?? "",
      requiredSlugs.length,
    ),
  });
  merged.exercises = padExerciseSets(merged.exercises, options?.prompt ?? "");
  if (merged.exercises.length === 0) {
    throw new Error(
      "Generated template had no valid exercises. Try a more specific description.",
    );
  }
  return { draft: merged, droppedSlugs };
}

export function parseOnDeviceSessionDraft(
  raw: unknown,
  allowedSlugs: Set<string>,
  existingSlugs: Set<string>,
  options?: { prompt?: string; requiredSlugs?: string[] },
): { draft: SessionDraft; droppedSlugs: string[] } {
  const parsed = sessionDraftSchema.parse(raw);
  const { draft, droppedSlugs } = groundSessionDraft(
    parsed,
    allowedSlugs,
    existingSlugs,
  );
  const merged = applyRequiredExercisesToSession(
    draft,
    options?.requiredSlugs ?? [],
    existingSlugs,
    {
      strictList: isExplicitExerciseList(
        options?.prompt ?? "",
        options?.requiredSlugs?.length ?? 0,
      ),
    },
  );
  merged.add = padExerciseSets(merged.add, options?.prompt ?? "");
  if (merged.removeSlugs.length === 0 && merged.add.length === 0) {
    throw new Error("No valid changes to apply. Try a clearer request.");
  }
  return { draft: merged, droppedSlugs };
}

export function catalogExercisesForAi(
  exercises: {
    slug: string;
    name: string;
    category: CatalogExercise["category"];
    custom?: boolean;
    archived?: boolean;
  }[],
): CatalogExercise[] {
  return exercises
    .filter((exercise) => !exercise.archived)
    .map((exercise) => ({
      slug: exercise.slug,
      name: exercise.name,
      category: exercise.category,
    }));
}

export function appleAiIsUsable(availability: AppleFoundationAvailability) {
  if (availability.onDevice) return true;
  return availability.pcc && !availability.pccQuotaReached;
}

export type AiGenerationAccess = {
  available: boolean;
  usesApple: boolean;
  isPro: boolean;
  entitlementPending: boolean;
};

/**
 * Logged-out and Free → on-device / PCC. Pro → Gateway.
 * `entitlement === undefined` while Convex is still loading must not look like
 * Free, or a signed-in Pro tap would hit Apple instead of `/api/ai/*`.
 */
export function resolveAiGenerationAccess(options: {
  isAuthenticated: boolean;
  entitlement: { isPro: boolean } | null | undefined;
  appleReady: boolean;
}): AiGenerationAccess {
  const isPro = options.entitlement?.isPro === true;
  const entitlementPending =
    options.isAuthenticated && options.entitlement === undefined;
  if (entitlementPending) {
    return {
      available: false,
      usesApple: false,
      isPro: false,
      entitlementPending: true,
    };
  }
  return {
    available: isPro || options.appleReady,
    usesApple: !isPro && options.appleReady,
    isPro,
    entitlementPending: false,
  };
}

function promptFitsAppleFallback(prompt: string | undefined): boolean {
  if (prompt == null) return true;
  return prompt.trim().length <= APPLE_ON_DEVICE_PROMPT_CHARS;
}

/** Server 4xx that already ran the model should not retry on-device. */
export function shouldFallBackToApple(
  error: unknown,
  prompt?: string,
): boolean {
  if (!promptFitsAppleFallback(prompt)) return false;
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  if (message.includes("invalid request") || message.includes("too large")) {
    return false;
  }
  return true;
}
