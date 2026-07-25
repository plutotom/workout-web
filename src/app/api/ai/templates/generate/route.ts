import { ConvexHttpClient } from "convex/browser";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { z } from "zod";

import { api } from "@backend/api";
import { consumeAiGenerationOrError } from "@/lib/ai/consume-generation";
import { generateStructuredObject } from "@/lib/ai/generate-structured";
import { aiJsonError } from "@/lib/ai/json-error";
import { describeModelGenerateFailure } from "@/lib/ai/model-generate-failure";
import { resolveAiGatewayModel } from "@/lib/ai/resolve-model";
import {
  curatedCatalogForPrompt,
  formatCatalogForPrompt,
  GENERATE_SYSTEM_PROMPT,
  groundTemplateDraft,
  selectCatalogForAiPrompt,
  templateDraftSchema,
  type TemplateDraft,
} from "@/lib/ai/template-draft";
import {
  parseBoundedJson,
  RequestBodyTooLargeError,
} from "@/lib/http/parse-json";

export const runtime = "nodejs";

const currentExerciseSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  sets: z
    .array(
      z.object({
        weight: z.number().finite().min(0).max(10_000),
        reps: z.number().finite().min(0).max(1_000),
      }),
    )
    .max(20),
});

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  mode: z.enum(["create", "edit"]).default("create"),
  current: z
    .object({
      name: z.string().max(100),
      exercises: z.array(currentExerciseSchema).max(50),
    })
    .optional(),
});

function requireConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return url;
}

export async function POST(request: Request) {
  const auth = await withAuth({ ensureSignedIn: true });
  if (!auth.user || !auth.accessToken) {
    return aiJsonError(401, "Not authenticated");
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await parseBoundedJson(request, 32_768));
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
  convex.setAuth(auth.accessToken);

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
  const allowedSlugs = new Set(
    [...curatedCatalogForPrompt(), ...customCatalog].map((e) => e.slug),
  );
  const promptCatalog = selectCatalogForAiPrompt({
    customs: customCatalog,
    mustIncludeSlugs: body.current?.exercises.map((e) => e.slug) ?? [],
    prompt: body.prompt,
  });

  const catalogBlock = formatCatalogForPrompt(promptCatalog);
  const userParts = [`Mode: ${body.mode}`, `User request:\n${body.prompt}`];
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
      maxOutputTokens: 2_000,
    });
  } catch (error) {
    console.error("AI template generation failed", error);
    const failure = describeModelGenerateFailure(error, "template");
    return aiJsonError(502, failure.error, {
      code: failure.code,
      hint: failure.hint,
    });
  }

  const { draft, droppedSlugs } = groundTemplateDraft(object, allowedSlugs);
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
