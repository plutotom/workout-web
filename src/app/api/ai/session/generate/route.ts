import { generateObject } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { ConvexHttpClient } from "convex/browser";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { z } from "zod";

import { api } from "@backend/api";
import {
  curatedCatalogForPrompt,
  formatCatalogForPrompt,
  groundSessionDraft,
  SESSION_GENERATE_SYSTEM_PROMPT,
  sessionDraftSchema,
  type SessionDraft,
} from "@/lib/ai/session-draft";

export const runtime = "nodejs";

const currentSetSchema = z.object({
  completed: z.boolean(),
  weight: z.number(),
  reps: z.number(),
});

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  current: z.object({
    exercises: z.array(
      z.object({
        slug: z.string(),
        sets: z.array(currentSetSchema),
      }),
    ),
  }),
});

function jsonError(status: number, error: string, code?: string) {
  return Response.json({ error, code }, { status });
}

function requireConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return url;
}

function resolveModel(): string {
  return process.env.AI_GATEWAY_MODEL?.trim() || "openai/gpt-5-nano";
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
    return jsonError(401, "Not authenticated");
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Invalid request body");
  }

  const convex = new ConvexHttpClient(requireConvexUrl());
  convex.setAuth(auth.accessToken);

  const entitlement = await convex.query(api.routes.auth.users.entitlement, {});
  if (!entitlement) {
    return jsonError(401, "User not found");
  }
  if (!entitlement.isPro) {
    return jsonError(403, "AI workout generation requires Pro", "PRO_REQUIRED");
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
  const existingSlugs = new Set(
    body.current.exercises.map((e) => e.slug.trim()).filter(Boolean),
  );

  const catalogBlock = formatCatalogForPrompt(catalog);
  const userParts = [
    summarizeCurrentSession(body.current.exercises),
    `User request:\n${body.prompt}`,
    `Exercise catalog for add (slug | name | category):\n${catalogBlock}`,
  ];

  let object: SessionDraft;
  try {
    const result = await generateObject({
      model: gateway(resolveModel()),
      schema: sessionDraftSchema,
      schemaName: "SessionReshapeDraft",
      schemaDescription:
        "Removals and additions for an in-progress workout. User reviews before apply.",
      system: SESSION_GENERATE_SYSTEM_PROMPT,
      prompt: userParts.join("\n\n"),
      temperature: 0.3,
    });
    object = result.object;
  } catch (error) {
    console.error("AI session generation failed", error);
    return jsonError(502, "Couldn't generate exercises. Try again.");
  }

  const { draft, droppedSlugs } = groundSessionDraft(
    object,
    allowedSlugs,
    existingSlugs,
  );
  if (draft.removeSlugs.length === 0 && draft.add.length === 0) {
    return jsonError(422, "No valid changes to apply. Try a clearer request.");
  }

  return Response.json({
    draft,
    droppedSlugs,
    model: resolveModel(),
  });
}
