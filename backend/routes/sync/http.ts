import { makeFunctionReference, type UserIdentity } from "convex/server";

import { httpAction, type ActionCtx } from "../../_generated/server";
import {
  parsePullCursorParam,
  parsePushRequestBody,
  type SyncPullResponse,
  type SyncPushOp,
  type SyncPushResponse,
} from "./core";

const ensureOwnerRef = makeFunctionReference<
  "mutation",
  { tokenIdentifier: string; email?: string; emailVerified: boolean },
  string
>("routes/sync/store:ensureOwner");

function ensureOwner(ctx: ActionCtx, identity: UserIdentity): Promise<string> {
  return ctx.runMutation(ensureOwnerRef, {
    tokenIdentifier: identity.tokenIdentifier,
    ...(identity.email ? { email: identity.email } : {}),
    emailVerified: identity.emailVerified === true,
  });
}

const applyPushRef = makeFunctionReference<
  "mutation",
  { ownerId: string; ops: SyncPushOp[] },
  SyncPushResponse
>("routes/sync/store:applyPush");

const readPullRef = makeFunctionReference<
  "query",
  { ownerId: string; cursor: number; limit?: number },
  SyncPullResponse
>("routes/sync/store:readPull");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export const push = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parsePushRequestBody(body);
  if (!parsed.ok) {
    return jsonResponse({ error: parsed.error }, 400);
  }

  const ownerId = await ensureOwner(ctx, identity);

  const result = await ctx.runMutation(applyPushRef, {
    ownerId,
    ops: parsed.value,
  });

  return jsonResponse(result, 200);
});

export const pull = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const parsedCursor = parsePullCursorParam(url.searchParams.get("cursor"));
  if (!parsedCursor.ok) {
    return jsonResponse({ error: parsedCursor.error }, 400);
  }

  const rawLimit = url.searchParams.get("limit");
  let limit: number | undefined;
  if (rawLimit !== null && rawLimit.trim() !== "") {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      return jsonResponse({ error: "limit must be a positive integer" }, 400);
    }
    limit = parsedLimit;
  }

  const ownerId = await ensureOwner(ctx, identity);

  const result = await ctx.runQuery(readPullRef, {
    ownerId,
    cursor: parsedCursor.value,
    ...(limit !== undefined ? { limit } : {}),
  });

  return jsonResponse(result, 200);
});
