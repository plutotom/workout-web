import { generateObject } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { ConvexHttpClient } from "convex/browser";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { z } from "zod";

import { api } from "@backend/api";
import {
  curatedCatalogForPrompt,
  formatCatalogForPrompt,
  GENERATE_SYSTEM_PROMPT,
  groundTemplateDraft,
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

function jsonError(status: number, error: string, code?: string) {
  return Response.json(
    { error, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function requireConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return url;
}

function resolveModel(): string {
  return process.env.AI_GATEWAY_MODEL?.trim() || "openai/gpt-5-nano";
}

export async function POST(request: Request) {
  const auth = await withAuth({ ensureSignedIn: true });
  if (!auth.user || !auth.accessToken) {
    return jsonError(401, "Not authenticated");
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await parseBoundedJson(request, 32_768));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError(413, "Request body is too large");
    }
    return jsonError(400, "Invalid request body");
  }

  if (body.mode === "edit" && !body.current) {
    return jsonError(400, "Edit mode requires the current template");
  }

  const convex = new ConvexHttpClient(requireConvexUrl());
  convex.setAuth(auth.accessToken);

  const entitlement = await convex.query(api.routes.auth.users.entitlement, {});
  if (!entitlement) {
    return jsonError(401, "User not found");
  }
  if (!entitlement.isPro) {
    return jsonError(
      403,
      "AI template generation requires Pro",
      "PRO_REQUIRED",
    );
  }

  try {
    await convex.mutation(api.routes.ai.usage.consumeGeneration, {});
  } catch (error) {
    if (String(error).includes("AI_RATE_LIMITED")) {
      return jsonError(429, "Too many AI generations. Try again later.");
    }
    throw error;
  }

  const customs = await convex.query(api.routes.exercises.queries.list, {});
  const customCatalog = customs
    .filter((e) => !e.archived)
    .map((e) => ({
      slug: e.slug,
      name: e.name,
      category: e.category,
    }));

  const catalog = [...curatedCatalogForPrompt(), ...customCatalog];
  const allowedSlugs = new Set(catalog.map((e) => e.slug));

  const catalogBlock = formatCatalogForPrompt(catalog);
  const userParts = [`Mode: ${body.mode}`, `User request:\n${body.prompt}`];
  if (body.mode === "edit" && body.current) {
    userParts.push(
      `Current template JSON (edit this; keep exercises the user did not ask to change unless needed):\n${JSON.stringify(body.current)}`,
    );
  }
  userParts.push(
    `Exercise catalog (slug | name | category). Use ONLY these slugs:\n${catalogBlock}`,
  );

  let object: TemplateDraft;
  try {
    const result = await generateObject({
      model: gateway(resolveModel()),
      schema: templateDraftSchema,
      schemaName: "WorkoutTemplate",
      schemaDescription:
        "A single workout template with catalog exercise slugs and set presets.",
      system: GENERATE_SYSTEM_PROMPT,
      prompt: userParts.join("\n\n"),
      temperature: 0.4,
      maxOutputTokens: 1_500,
    });
    object = result.object;
  } catch (error) {
    console.error("AI template generation failed", error);
    return jsonError(502, "Couldn't generate a template. Try again.");
  }

  const { draft, droppedSlugs } = groundTemplateDraft(object, allowedSlugs);
  if (draft.exercises.length === 0) {
    return jsonError(
      422,
      "Generated template had no valid exercises. Try a more specific description.",
    );
  }

  return Response.json(
    {
      draft,
      droppedSlugs,
      model: resolveModel(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
