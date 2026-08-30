import { ConvexHttpClient } from "convex/browser";

import { api } from "@backend/api";
import { accessTokenForRequest } from "@/lib/ai/request-auth";
import {
  TEMPLATE_BODY_LIMIT_BYTES,
  templateRequestSchema,
  type TemplateRequest,
} from "@/lib/ai/request-schemas";
import { consumeAiGenerationOrError } from "@/lib/ai/consume-generation";
import { generateStructuredObject } from "@/lib/ai/generate-structured";
import { aiJsonError } from "@/lib/ai/json-error";
import { describeModelGenerateFailure } from "@/lib/ai/model-generate-failure";
import { resolveAiGatewayModel } from "@/lib/ai/resolve-model";
import {
  curatedCatalogForPrompt,
  formatCatalogForPrompt,
  GENERATE_SYSTEM_PROMPT,
  applyRequiredExercisesToTemplate,
  detectRequiredExerciseSlugs,
  formatRequiredExercisesPromptBlock,
  groundTemplateDraft,
  isExplicitExerciseList,
  padExerciseSets,
  selectCatalogForAiPrompt,
  templateDraftSchema,
  type TemplateDraft,
} from "@/lib/ai/template-draft";
import {
  parseBoundedJson,
  RequestBodyTooLargeError,
} from "@/lib/http/parse-json";

export const runtime = "nodejs";

function requireConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return url;
}

export async function POST(request: Request) {
  const accessToken = await accessTokenForRequest(request);
  if (!accessToken) {
    return aiJsonError(401, "Not authenticated");
  }

  let body: TemplateRequest;
  try {
    body = templateRequestSchema.parse(
      await parseBoundedJson(request, TEMPLATE_BODY_LIMIT_BYTES),
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return aiJsonError(413, "Request body is too large");
    }
    return aiJsonError(400, "Invalid request body");
  }

  if (body.mode === "edit" && !body.current) {
    return aiJsonError(400, "Edit mode requires the current template");
  }

  const convex = new ConvexHttpClient(requireConvexUrl());
  convex.setAuth(accessToken);

  const entitlement = await convex.query(api.routes.auth.users.entitlement, {});
  if (!entitlement) {
    return aiJsonError(401, "User not found");
  }
  if (!entitlement.isPro) {
    return aiJsonError(403, "AI template generation requires Pro", {
      code: "PRO_REQUIRED",
      hint: "Upgrade in Settings to unlock Describe with AI.",
    });
  }

  const customs = await convex.query(api.routes.exercises.queries.list, {});
  const customCatalog = customs
    .filter((e) => !e.archived)
    .map((e) => ({
      slug: e.slug,
      name: e.name,
      category: e.category,
    }));

  // Ground against the full catalog; only send a compact subset to the model.
  const fullCatalog = [...curatedCatalogForPrompt(), ...customCatalog];
  const allowedSlugs = new Set(fullCatalog.map((e) => e.slug));
  const requiredSlugs = detectRequiredExerciseSlugs(body.prompt, fullCatalog);
  const promptCatalog = selectCatalogForAiPrompt({
    customs: customCatalog,
    mustIncludeSlugs: [
      ...(body.current?.exercises.map((e) => e.slug) ?? []),
      ...requiredSlugs,
    ],
    prompt: body.prompt,
  });

  const catalogBlock = formatCatalogForPrompt(promptCatalog);
  const userParts = [`Mode: ${body.mode}`, `User request:\n${body.prompt}`];
  const requiredBlock = formatRequiredExercisesPromptBlock(
    requiredSlugs,
    fullCatalog,
  );
  if (requiredBlock) userParts.push(requiredBlock);
  if (body.mode === "edit" && body.current) {
    userParts.push(
      `Current template JSON (edit this; keep exercises the user did not ask to change unless needed):\n${JSON.stringify(body.current)}`,
    );
  }
  userParts.push(
    `Exercise catalog (slug | name | category). Use ONLY these slugs:\n${catalogBlock}`,
  );

  const model = resolveAiGatewayModel();
  let object: TemplateDraft;
  try {
    object = await generateStructuredObject({
      model,
      schema: templateDraftSchema,
      schemaName: "WorkoutTemplate",
      schemaDescription:
        "A single workout template with catalog exercise slugs and set presets.",
      system: GENERATE_SYSTEM_PROMPT,
      prompt: userParts.join("\n\n"),
      temperature: 0.4,
      maxOutputTokens: 10_000,
    });
  } catch (error) {
    console.error("AI template generation failed", error);
    const failure = describeModelGenerateFailure(error, "template");
    return aiJsonError(502, failure.error, {
      code: failure.code,
      hint: failure.hint,
    });
  }

  const { draft: grounded, droppedSlugs } = groundTemplateDraft(
    object,
    allowedSlugs,
  );
  const draft = applyRequiredExercisesToTemplate(grounded, requiredSlugs, {
    strictList: isExplicitExerciseList(body.prompt, requiredSlugs.length),
  });
  draft.exercises = padExerciseSets(draft.exercises, body.prompt);
  if (draft.exercises.length === 0) {
    return aiJsonError(
      422,
      "Generated template had no valid exercises. Try a more specific description.",
    );
  }

  const quotaError = await consumeAiGenerationOrError(convex, aiJsonError);
  if (quotaError) return quotaError;

  return Response.json(
    {
      draft,
      droppedSlugs,
      model,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
