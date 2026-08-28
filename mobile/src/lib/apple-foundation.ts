import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

import {
  UNAVAILABLE_APPLE_FOUNDATION,
  buildOnDeviceSessionPrompt,
  buildOnDeviceTemplatePrompt,
  estimateAppleTokens,
  generateWithAppleModelFallback,
  parseOnDeviceSessionDraft,
  parseOnDeviceTemplateDraft,
  type AppleFoundationAvailability,
  type CatalogExercise,
  type SessionDraft,
  type TemplateDraft,
} from "@shared/ai/apple-on-device";

type AppleFoundationNative = {
  getAvailability: () => Promise<NativeAvailability>;
  tokenCount: (instructions: string, prompt: string) => Promise<number>;
  generate: (
    instructions: string,
    prompt: string,
    kind: "template" | "session",
    model: "onDevice" | "pcc",
  ) => Promise<{ model: "onDevice" | "pcc"; draft: unknown }>;
};

type NativeAvailability = {
  onDevice?: boolean;
  onDeviceReason?: string | null;
  pcc?: boolean;
  pccReason?: string | null;
  onDeviceContextSize?: number;
  pccContextSize?: number;
  pccQuotaReached?: boolean;
};

const native =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<AppleFoundationNative>(
        "AppleFoundationModels",
      )
    : null;

function normalizeAvailability(
  raw: NativeAvailability | null,
): AppleFoundationAvailability {
  if (!raw) return UNAVAILABLE_APPLE_FOUNDATION;
  return {
    onDevice: raw.onDevice === true,
    onDeviceReason: raw.onDeviceReason ?? null,
    pcc: raw.pcc === true,
    pccReason: raw.pccReason ?? null,
    onDeviceContextSize: raw.onDeviceContextSize ?? 0,
    pccContextSize: raw.pccContextSize ?? 0,
    pccQuotaReached: raw.pccQuotaReached === true,
  };
}

export async function getAppleFoundationAvailability(): Promise<AppleFoundationAvailability> {
  if (!native) return UNAVAILABLE_APPLE_FOUNDATION;
  try {
    return normalizeAvailability(await native.getAvailability());
  } catch {
    return UNAVAILABLE_APPLE_FOUNDATION;
  }
}

function appleErrorMessage(caught: unknown): string {
  if (caught instanceof Error && caught.message.trim()) return caught.message;
  return "Couldn’t generate on this iPhone. Try a clearer description.";
}

async function generateWithApple<T>(options: {
  kind: "template" | "session";
  instructions: string;
  prompt: string;
  parse: (draft: unknown) => T;
}): Promise<T & { model: "onDevice" | "pcc" }> {
  if (!native) {
    throw new Error("Apple Intelligence is only available on iPhone.");
  }
  const appleNative = native;
  const availability = await getAppleFoundationAvailability();
  let inputTokens = estimateAppleTokens(options.instructions + options.prompt);
  try {
    const counted = await appleNative.tokenCount(
      options.instructions,
      options.prompt,
    );
    if (counted > 0) inputTokens = counted;
  } catch {
    // Char estimate is enough to choose on-device vs PCC.
  }

  return generateWithAppleModelFallback({
    availability,
    inputTokens,
    toUserError: (error) => new Error(appleErrorMessage(error)),
    generate: async (model) => {
      const raw = await appleNative.generate(
        options.instructions,
        options.prompt,
        options.kind,
        model,
      );
      return { ...options.parse(raw.draft), model: raw.model };
    },
  });
}

export async function generateTemplateOnApple(options: {
  prompt: string;
  mode: "create" | "edit";
  catalog: CatalogExercise[];
  current?: TemplateDraft;
}): Promise<{
  draft: TemplateDraft;
  droppedSlugs: string[];
  model: "onDevice" | "pcc";
}> {
  const built = buildOnDeviceTemplatePrompt(options);
  return generateWithApple({
    kind: "template",
    instructions: built.instructions,
    prompt: built.prompt,
    parse: (draft) => parseOnDeviceTemplateDraft(draft, built.allowedSlugs),
  });
}

export async function generateSessionOnApple(options: {
  prompt: string;
  catalog: CatalogExercise[];
  current: { exercises: { slug: string; done: number; total: number }[] };
}): Promise<{
  draft: SessionDraft;
  droppedSlugs: string[];
  model: "onDevice" | "pcc";
}> {
  const built = buildOnDeviceSessionPrompt(options);
  const existingSlugs = new Set(
    options.current.exercises
      .map((exercise) => exercise.slug.trim())
      .filter(Boolean),
  );
  return generateWithApple({
    kind: "session",
    instructions: built.instructions,
    prompt: built.prompt,
    parse: (draft) =>
      parseOnDeviceSessionDraft(draft, built.allowedSlugs, existingSlugs),
  });
}
