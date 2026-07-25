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
  groundSessionDraft,
  SESSION_GENERATE_SYSTEM_PROMPT,
  sessionDraftSchema,
  type SessionDraft,
} from "@/lib/ai/session-draft";
import { selectCatalogForAiPrompt } from "@/lib/ai/template-draft";
import {
  parseBoundedJson,
  RequestBodyTooLargeError,
} from "@/lib/http/parse-json";

export const runtime = "nodejs";

const currentSetSchema = z.object({
  completed: z.boolean(),
  weight: z.number().finite().min(0).max(10_000),
  reps: z.number().finite().min(0).max(1_000),
});

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  current: z.object({
    exercises: z
      .array(
        z.object({
          slug: z.string().trim().min(1).max(64),
          sets: z.array(currentSetSchema).max(20),
        }),
      )
      .max(50),
  }),
});

function requireConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return url;
}

function summarizeCurrentSession(
  exercises: z.infer<typeof bodySchema>["current"]["exercises"],
): string {
  if (exercises.length === 0) {
    return "Current session: empty (no exercises yet).";
  }
  const lines = exercises.map((ex, i) => {
    const done = ex.sets.filter((s) => s.completed).length;
    const total = ex.sets.length;
    return `${i + 1}. ${ex.slug} (${done}/${total} sets done)`;
  });
  return `Current session exercises (use these exact slugs in removeSlugs):\n${lines.join("\n")}`;
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

  const convex = new ConvexHttpClient(requireConvexUrl());
  convex.setAuth(auth.accessToken);

  const entitlement = await convex.query(api.routes.auth.users.entitlement, {});
  if (!entitlement) {
    return aiJsonError(401, "User not found");
  }
  if (!entitlement.isPro) {
    return aiJsonError(403, "AI workout generation requires Pro", {
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

  const existingSlugs = new Set(
    body.current.exercises.map((e) => e.slug.trim()).filter(Boolean),
  );
  // Ground against the full catalog; only send a compact subset to the model.
  const allowedSlugs = new Set(
    [...curatedCatalogForPrompt(), ...customCatalog].map((e) => e.slug),
  );
  const promptCatalog = selectCatalogForAiPrompt({
    customs: customCatalog,
    mustIncludeSlugs: existingSlugs,
    prompt: body.prompt,
  });

  const catalogBlock = formatCatalogForPrompt(promptCatalog);
  const userParts = [
    summarizeCurrentSession(body.current.exercises),
    `User request:\n${body.prompt}`,
    `Exercise catalog for add (slug | name | category):\n${catalogBlock}`,
  ];

  const model = resolveAiGatewayModel();
  let object: SessionDraft;
  try {
    object = await generateStructuredObject({
      model,
      schema: sessionDraftSchema,
      schemaName: "SessionReshapeDraft",
      schemaDescription:
        "Removals and additions for an in-progress workout. User reviews before apply.",
      system: SESSION_GENERATE_SYSTEM_PROMPT,
      prompt: userParts.join("\n\n"),
      temperature: 0.3,
      maxOutputTokens: 2_000,
    });
  } catch (error) {
    console.error("AI session generation failed", error);
    const failure = describeModelGenerateFailure(error, "exercises");
    return aiJsonError(502, failure.error, {
      code: failure.code,
      hint: failure.hint,
    });
  }

  const { draft, droppedSlugs } = groundSessionDraft(
    object,
    allowedSlugs,
    existingSlugs,
  );
  if (draft.removeSlugs.length === 0 && draft.add.length === 0) {
    return aiJsonError(
      422,
      "No valid changes to apply. Try a clearer request.",
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
