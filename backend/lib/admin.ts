import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

import { requireUser } from "./auth";

/** Parse comma-separated admin emails from Convex env. */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Admin access.
 * - `user.role === "admin"`
 * - OR email listed in `ADMIN_EMAILS` env (comma-separated)
 */
export function isAdminUser(
  user: Pick<Doc<"users">, "email" | "role">,
  adminEmailsRaw: string | undefined = process.env.ADMIN_EMAILS,
): boolean {
  if (user.role === "admin") return true;
  const allowlist = parseAdminEmails(adminEmailsRaw);
  if (!user.email) return false;
  return allowlist.has(user.email.trim().toLowerCase());
}

/** Like {@link requireUser} but also requires admin. */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!isAdminUser(user)) {
    throw new Error("Unauthorized: Admin access required");
  }
  return user;
}
