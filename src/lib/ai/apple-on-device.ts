import { z } from "zod";

import {
  GENERATE_SYSTEM_PROMPT,
  ON_DEVICE_PROMPT_CATALOG_MAX,
  applyRequiredExercisesToTemplate,
  defaultWorkingSets,
  detectExactExerciseListSlugs,
  detectRequiredExerciseSlugs,
  formatCatalogForPrompt,
  formatRequiredExercisesPromptBlock,
  groundTemplateDraft,
  inferWorkingSetCount,
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
/** Compact plans retrieve a smaller, higher-signal candidate set. */
export const APPLE_COMPACT_PROMPT_CATALOG_MAX = 32;
/** Avoid letting a large custom library crowd every built-in lift out. */
export const APPLE_COMPACT_CUSTOM_CATALOG_MAX = 8;

const compactExercisePlanSchema = z.object({
  slug: z.string().min(1).max(64),
  setCount: z.number().finite(),
  reps: z.number().finite(),
  weight: z.number().finite(),
});

export const compactTemplatePlanSchema = z.object({
  name: z.string().min(1).max(80),
  exercises: z.array(compactExercisePlanSchema).min(1).max(20),
});

export const compactSessionPlanSchema = z.object({
  removeSlugs: z.array(z.string().min(1).max(64)).max(40),
  add: z.array(compactExercisePlanSchema).max(20),
});

export type CompactTemplatePlan = z.infer<typeof compactTemplatePlanSchema>;
export type CompactSessionPlan = z.infer<typeof compactSessionPlanSchema>;

export const COMPACT_TEMPLATE_SYSTEM_PROMPT = `Select a strength workout plan.

Rules:
- Use only slugs in the candidate catalog.
- Include every required slug.
- Required does not mean exclusive; fill broad sessions to the requested count, or 5–7 exercises by default.
- Preserve the user's order for named lifts.
- setCount is working sets. Default 3.
- reps and weight are one preset repeated across those sets. Use 0 when unspecified.
- Output one workout, not a multi-day program.`;

export const COMPACT_SESSION_SYSTEM_PROMPT = `Select compact changes to the current strength workout.

Rules:
- removeSlugs may contain only current-session slugs.
- add may use only slugs in the candidate catalog.
- Include every required add slug.
- Keep unmentioned current exercises.
- setCount is working sets. Default 3.
- reps and weight are one preset repeated across those sets. Use 0 when unspecified.`;

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

function selectCompactCustomCatalog(options: {
  prompt: string;
  catalog: CatalogExercise[];
  mustIncludeSlugs?: Iterable<string>;
}): CatalogExercise[] {
  const customs = customCatalog(options.catalog);
  const mustInclude = new Set(options.mustIncludeSlugs ?? []);
  const mustIncludeCustomCount = customs.filter((exercise) =>
    mustInclude.has(exercise.slug),
  ).length;
  const limit = Math.min(
    20,
    Math.max(APPLE_COMPACT_CUSTOM_CATALOG_MAX, mustIncludeCustomCount),
  );
  const promptTokens = options.prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);

  return customs
    .map((exercise, index) => {
      const haystack = `${exercise.slug} ${exercise.name}`.toLowerCase();
      const score = mustInclude.has(exercise.slug)
        ? 10_000
        : promptTokens.reduce(
            (total, token) => total + (haystack.includes(token) ? 1 : 0),
            0,
          );
      return { exercise, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter(
      (candidate, index) =>
        candidate.score > 0 || index < APPLE_COMPACT_CUSTOM_CATALOG_MAX,
    )
    .slice(0, limit)
    .map((candidate) => candidate.exercise);
}

export function selectCompactOnDeviceCatalog(options: {
  prompt: string;
  catalog: CatalogExercise[];
  mustIncludeSlugs?: Iterable<string>;
}): CatalogExercise[] {
  const customs = selectCompactCustomCatalog(options);
  const expanded = selectCatalogForAiPrompt({
    prompt: options.prompt,
    customs,
    mustIncludeSlugs: options.mustIncludeSlugs,
    max: 96,
  });
  const lower = options.prompt.toLowerCase();
  const relevantCategories = new Set<CatalogExercise["category"]>();
  const addCategory = (category: CatalogExercise["category"]) =>
    relevantCategories.add(category);

  if (/\bpush(?:\s+day)?\b/.test(lower)) {
    addCategory("chest");
    addCategory("shoulders");
    addCategory("arms");
  }
  if (/\bpull(?:\s+day)?\b/.test(lower)) {
    addCategory("back");
    addCategory("arms");
  }
  if (/\b(?:upper|upper[- ]body)\b/.test(lower)) {
    addCategory("chest");
    addCategory("back");
    addCategory("shoulders");
    addCategory("arms");
  }
  if (/\b(?:lower|lower[- ]body|leg day)\b/.test(lower)) {
    addCategory("legs");
    addCategory("core");
  }
  for (const [pattern, category] of [
    [/\bchest\b/, "chest"],
    [/\bback\b/, "back"],
    [/\blegs?\b/, "legs"],
    [/\bshoulders?\b/, "shoulders"],
    [/\barms?\b/, "arms"],
    [/\b(?:core|abs?)\b/, "core"],
  ] as const) {
    if (pattern.test(lower)) addCategory(category);
  }

  const mustInclude = new Set(options.mustIncludeSlugs ?? []);
  const customSlugs = new Set(customs.map((exercise) => exercise.slug));
  const selected = new Map<string, CatalogExercise>();
  const add = (exercise: CatalogExercise) => {
    if (selected.size < APPLE_COMPACT_PROMPT_CATALOG_MAX) {
      selected.set(exercise.slug, exercise);
    }
  };
  expanded.filter((exercise) => mustInclude.has(exercise.slug)).forEach(add);
  expanded
    .filter(
      (exercise) =>
        relevantCategories.has(exercise.category) &&
        !customSlugs.has(exercise.slug),
    )
    .forEach(add);
  expanded
    .filter(
      (exercise) =>
        relevantCategories.has(exercise.category) &&
        customSlugs.has(exercise.slug),
    )
    .forEach(add);
  expanded.filter((exercise) => customSlugs.has(exercise.slug)).forEach(add);
  expanded.forEach(add);
  return [...selected.values()];
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

export function buildCompactOnDeviceTemplatePrompt(options: {
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
  exactListSlugs: string[] | null;
  candidateSlugs: string[];
} {
  const userPrompt = assertApplePromptLength(options.prompt);
  const requiredSlugs = detectRequiredExerciseSlugs(
    userPrompt,
    options.catalog,
  );
  const exactListSlugs =
    options.mode === "create"
      ? detectExactExerciseListSlugs(userPrompt, options.catalog)
      : null;
  const mustInclude = [
    ...(options.current?.exercises.map((exercise) => exercise.slug) ?? []),
    ...requiredSlugs,
  ];
  const promptCatalog = selectCompactOnDeviceCatalog({
    prompt: userPrompt,
    catalog: options.catalog,
    mustIncludeSlugs: mustInclude,
  });
  const parts = [`Mode: ${options.mode}`, `User request:\n${userPrompt}`];
  if (requiredSlugs.length > 0) {
    parts.push(`Required slugs:\n${requiredSlugs.join("\n")}`);
  }
  if (options.mode === "edit" && options.current) {
    parts.push(summarizeTemplateForOnDevicePrompt(options.current));
  }
  parts.push(
    `Candidate catalog (slug | name):\n${formatCatalogForPrompt(promptCatalog, "compact")}`,
  );
  return {
    instructions: COMPACT_TEMPLATE_SYSTEM_PROMPT,
    prompt: parts.join("\n\n"),
    allowedSlugs: new Set(options.catalog.map((exercise) => exercise.slug)),
    requiredSlugs,
    exactListSlugs,
    candidateSlugs: promptCatalog.map((exercise) => exercise.slug),
  };
}

export function buildCompactOnDeviceSessionPrompt(options: {
  prompt: string;
  catalog: CatalogExercise[];
  current: { exercises: { slug: string; done: number; total: number }[] };
}): {
  instructions: string;
  prompt: string;
  allowedSlugs: Set<string>;
  requiredSlugs: string[];
  candidateSlugs: string[];
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
  const promptCatalog = selectCompactOnDeviceCatalog({
    prompt: userPrompt,
    catalog: options.catalog,
    mustIncludeSlugs: [...existingSlugs, ...requiredSlugs],
  });
  const parts = [
    summarizeSessionForOnDevicePrompt(options.current.exercises),
    `User request:\n${userPrompt}`,
  ];
  if (requiredSlugs.length > 0) {
    parts.push(`Required add slugs:\n${requiredSlugs.join("\n")}`);
  }
  parts.push(
    `Candidate catalog for add (slug | name):\n${formatCatalogForPrompt(promptCatalog, "compact")}`,
  );
  return {
    instructions: COMPACT_SESSION_SYSTEM_PROMPT,
    prompt: parts.join("\n\n"),
    allowedSlugs: new Set(options.catalog.map((exercise) => exercise.slug)),
    requiredSlugs,
    candidateSlugs: promptCatalog.map((exercise) => exercise.slug),
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

function inferPromptRepCount(prompt: string): number {
  const schemes = [...prompt.matchAll(/\d+\s*[x×]\s*(\d+)/gi)]
    .map((match) => Number(match[1]))
    .filter((reps) => reps >= 0 && reps <= 1000);
  const uniqueSchemes = [...new Set(schemes)];
  if (uniqueSchemes.length === 1) return uniqueSchemes[0]!;

  const named = prompt.match(/\b(\d+)\s*reps?\b/i);
  if (!named) return 0;
  const reps = Number(named[1]);
  return reps >= 0 && reps <= 1000 ? reps : 0;
}

function inferExplicitSetCount(prompt: string): number | null {
  if (/\b(?:single(?:\s+set)?|one\s+set|1\s+set)\b/i.test(prompt)) {
    return 1;
  }
  const schemes = [...prompt.matchAll(/(\d+)\s*[x×]\s*\d+/gi)]
    .map((match) => Number(match[1]))
    .filter((count) => count >= 1 && count <= 20);
  const uniqueSchemes = [...new Set(schemes)];
  if (uniqueSchemes.length === 1) return uniqueSchemes[0]!;
  if (uniqueSchemes.length > 1) return null;

  const named = prompt.match(/\b(\d+)\s*sets?\b/i);
  if (!named) return null;
  const count = Number(named[1]);
  return count >= 1 && count <= 20 ? count : null;
}

function inferRequestedExerciseCount(prompt: string): number | null {
  const match = prompt.match(/\b(\d+)\s*(?:exercises?|lifts?|movements?)\b/i);
  if (!match) return null;
  const count = Number(match[1]);
  return count >= 1 && count <= 20 ? count : null;
}

function enforceRequestedExerciseCount(
  exercises: TemplateDraft["exercises"],
  options: {
    prompt: string;
    requiredSlugs: string[];
    candidateSlugs: string[];
  },
): TemplateDraft["exercises"] {
  const requested = inferRequestedExerciseCount(options.prompt);
  if (requested == null) return exercises;

  const target = Math.max(requested, options.requiredSlugs.length);
  const required = new Set(options.requiredSlugs);
  const result = [...exercises];
  while (result.length > target) {
    let removable = -1;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (!required.has(result[index]!.slug)) {
        removable = index;
        break;
      }
    }
    if (removable < 0) break;
    result.splice(removable, 1);
  }

  const seen = new Set(result.map((exercise) => exercise.slug));
  for (const slug of options.candidateSlugs) {
    if (result.length >= target) break;
    if (seen.has(slug)) continue;
    seen.add(slug);
    result.push({ slug, sets: defaultWorkingSets() });
  }
  return result;
}

function expandCompactExercise(
  exercise: z.infer<typeof compactExercisePlanSchema>,
): TemplateDraft["exercises"][number] {
  const setCount = Math.min(20, Math.max(1, Math.round(exercise.setCount)));
  return {
    slug: exercise.slug,
    sets: defaultWorkingSets(setCount, {
      weight: Math.max(0, Math.round(exercise.weight)),
      reps: Math.max(0, Math.round(exercise.reps)),
    }),
  };
}

function applyCompactPromptDefaults(
  exercises: TemplateDraft["exercises"],
  prompt: string,
): TemplateDraft["exercises"] {
  const reps = inferPromptRepCount(prompt);
  const explicitSetCount = inferExplicitSetCount(prompt);
  return padExerciseSets(exercises, prompt).map((exercise) => {
    const seed = exercise.sets[0] ?? { weight: 0, reps: 0 };
    const sets =
      explicitSetCount == null
        ? exercise.sets
        : defaultWorkingSets(explicitSetCount, seed);
    if (reps === 0) return { ...exercise, sets };
    return {
      ...exercise,
      sets: sets.map((set) => ({
        ...set,
        reps: set.reps === 0 ? reps : set.reps,
      })),
    };
  });
}

export function parseCompactOnDeviceTemplatePlan(
  raw: unknown,
  allowedSlugs: Set<string>,
  options?: {
    prompt?: string;
    requiredSlugs?: string[];
    exactListSlugs?: string[] | null;
    candidateSlugs?: string[];
  },
): { draft: TemplateDraft; droppedSlugs: string[] } {
  const plan = compactTemplatePlanSchema.parse(raw);
  const { draft, droppedSlugs } = groundTemplateDraft(
    {
      name: plan.name,
      exercises: plan.exercises.map(expandCompactExercise),
    },
    allowedSlugs,
  );
  const requiredSlugs = options?.exactListSlugs ?? options?.requiredSlugs ?? [];
  const merged = applyRequiredExercisesToTemplate(draft, requiredSlugs, {
    strictList: options?.exactListSlugs != null,
  });
  merged.exercises = enforceRequestedExerciseCount(merged.exercises, {
    prompt: options?.prompt ?? "",
    requiredSlugs,
    candidateSlugs: options?.candidateSlugs ?? [],
  });
  merged.exercises = applyCompactPromptDefaults(
    merged.exercises,
    options?.prompt ?? "",
  );
  if (merged.exercises.length === 0) {
    throw new Error(
      "Generated template had no valid exercises. Try a more specific description.",
    );
  }
  return { draft: merged, droppedSlugs };
}

export function parseCompactOnDeviceSessionPlan(
  raw: unknown,
  allowedSlugs: Set<string>,
  existingSlugs: Set<string>,
  options?: { prompt?: string; requiredSlugs?: string[] },
): { draft: SessionDraft; droppedSlugs: string[] } {
  const plan = compactSessionPlanSchema.parse(raw);
  const { draft, droppedSlugs } = groundSessionDraft(
    {
      removeSlugs: plan.removeSlugs,
      add: plan.add.map(expandCompactExercise),
    },
    allowedSlugs,
    existingSlugs,
  );
  const merged = applyRequiredExercisesToSession(
    draft,
    options?.requiredSlugs ?? [],
    existingSlugs,
  );
  merged.add = applyCompactPromptDefaults(merged.add, options?.prompt ?? "");
  if (merged.removeSlugs.length === 0 && merged.add.length === 0) {
    throw new Error("No valid changes to apply. Try a clearer request.");
  }
  return { draft: merged, droppedSlugs };
}

export function buildDeterministicExactListTemplate(options: {
  prompt: string;
  catalog: CatalogExercise[];
}): TemplateDraft | null {
  const slugs = detectExactExerciseListSlugs(options.prompt, options.catalog);
  if (!slugs) return null;

  const setCount = inferWorkingSetCount(options.prompt);
  const reps = inferPromptRepCount(options.prompt);
  const bySlug = new Map(
    options.catalog.map((exercise) => [exercise.slug, exercise]),
  );
  const categories = new Set(
    slugs.map((slug) => bySlug.get(slug)?.category).filter(Boolean),
  );
  const category = categories.size === 1 ? [...categories][0] : null;
  const name = category
    ? `${category.charAt(0).toUpperCase()}${category.slice(1)} Day`
    : "Custom Workout";

  return {
    name,
    exercises: slugs.map((slug) => ({
      slug,
      sets: defaultWorkingSets(setCount, { weight: 0, reps }),
    })),
  };
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
