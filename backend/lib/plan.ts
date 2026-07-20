import type { Doc } from "../_generated/dataModel";

export const planValidatorValues = ["free", "pro"] as const;
export type Plan = (typeof planValidatorValues)[number];

/** Parse comma-separated emails from Convex / Next env. */
export function parseProEmails(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Pro entitlement.
 * - Active Polar subscription (checked live in entitlement query)
 * - `user.plan === "pro"` (synced from Polar webhooks, or manual testing)
 * - OR email listed in `PRO_EMAILS` env (comma-separated)
 */
export function isProUser(
  user: Pick<Doc<"users">, "email" | "plan">,
  proEmailsRaw: string | undefined = process.env.PRO_EMAILS,
): boolean {
  if (user.plan === "pro") return true;
  const allowlist = parseProEmails(proEmailsRaw);
  if (!user.email) return false;
  return allowlist.has(user.email.trim().toLowerCase());
}

export function allowManualPro(
  raw: string | undefined = process.env.ALLOW_MANUAL_PRO,
): boolean {
  return raw?.trim().toLowerCase() === "true";
}
