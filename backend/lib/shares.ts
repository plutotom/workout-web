import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { PortableBundle } from "./portableTemplates";

const TOKEN_BYTES = 16;
const TOKEN_LENGTH = 22;
const MAX_ACTIVE_SHARES_PER_USER = 50;
const DEFAULT_TTL_DAYS = 30;
const MAX_TTL_DAYS = 365;
const DAY_MS = 24 * 60 * 60_000;

/**
 * A share token is a bearer secret: anyone who has the link can read the
 * bundle, which is the point — the recipient has no account yet. 128 bits of
 * entropy makes guessing infeasible, and shares are revocable and expire.
 */
export function generateShareToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function isShareTokenFormat(token: string): boolean {
  return new RegExp(`^[A-Za-z0-9_-]{${TOKEN_LENGTH}}$`).test(token);
}

function isLive(share: Doc<"templateShares">, now: number): boolean {
  if (share.revokedAt) return false;
  if (share.expiresAt && share.expiresAt <= now) return false;
  return true;
}

export async function createShare(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    bundle,
    sharedBy,
    expiresInDays,
  }: {
    bundle: PortableBundle;
    sharedBy?: string;
    expiresInDays?: number;
  },
) {
  if (bundle.templates.length === 0) {
    throw new Error("Select at least one template to share");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("templateShares")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  // Reap this user's dead links before enforcing the cap, so a long-time user
  // is never blocked by shares that already expired.
  const stale = existing.filter((s) => !isLive(s, now));
  await Promise.all(stale.map((s) => ctx.db.delete(s._id)));
  if (existing.length - stale.length >= MAX_ACTIVE_SHARES_PER_USER) {
    throw new Error(
      `At most ${MAX_ACTIVE_SHARES_PER_USER} active share links are allowed — revoke one first`,
    );
  }

  const ttlDays = Math.min(
    Math.max(Math.round(expiresInDays ?? DEFAULT_TTL_DAYS), 1),
    MAX_TTL_DAYS,
  );

  const token = generateShareToken();
  await ctx.db.insert("templateShares", {
    userId,
    token,
    sharedBy: sharedBy?.trim().slice(0, 60) || undefined,
    bundle,
    createdAt: now,
    expiresAt: now + ttlDays * DAY_MS,
    importCount: 0,
  });

  return { token, expiresAt: now + ttlDays * DAY_MS };
}

/**
 * Look up a live share by token. Returns null for unknown, revoked, and expired
 * tokens alike so the caller cannot distinguish them.
 */
export async function getLiveShare(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<Doc<"templateShares"> | null> {
  if (!isShareTokenFormat(token)) return null;
  const share = await ctx.db
    .query("templateShares")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!share || !isLive(share, Date.now())) return null;
  return share;
}

export async function revokeShare(
  ctx: MutationCtx,
  userId: Id<"users">,
  shareId: Id<"templateShares">,
) {
  const share = await ctx.db.get(shareId);
  if (!share || share.userId !== userId) throw new Error("Share not found");
  await ctx.db.patch(shareId, { revokedAt: Date.now() });
}

export async function listShares(ctx: QueryCtx, userId: Id<"users">) {
  const now = Date.now();
  const shares = await ctx.db
    .query("templateShares")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return shares
    .filter((s) => isLive(s, now))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => ({
      _id: s._id,
      token: s.token,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      importCount: s.importCount,
      templateNames: s.bundle.templates.map((t) => t.name),
    }));
}
