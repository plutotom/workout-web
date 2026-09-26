import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Same normalization as profile save — lowercase, no leading @. */
export function normalizeHandleInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(handle);
}

/** Exact usernames we never auto-assign or let someone claim. */
const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "api",
  "help",
  "me",
  "mod",
  "moderator",
  "official",
  "root",
  "settings",
  "staff",
  "support",
  "system",
  "team",
]);

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle);
}

/** Derive a username candidate from an email local part. */
export function handleBaseFromEmail(email: string): string {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  let base = local
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (base.length < 3) base = base ? `${base}_gl` : "athlete";
  return base.slice(0, 24);
}

/** Match display name or username (never email — that would enumerate accounts). */
export function matchesAthleteSearch(
  user: Pick<Doc<"users">, "handle" | "displayName">,
  term: string,
): boolean {
  const needle = term.trim().toLowerCase().replace(/^@/, "");
  if (!needle) return true;
  if (user.handle?.includes(needle)) return true;
  const name = user.displayName?.toLowerCase() ?? "";
  return name.length > 0 && name.includes(needle);
}

export function isSearchableAthlete(
  user: Doc<"users">,
  viewerId: Id<"users">,
): boolean {
  return user._id !== viewerId && Boolean(user.handle);
}

const SEARCH_POOL = 250;
const SEARCH_LIMIT = 25;
const MATCH_TAKE = 50;

/** Inclusive start / exclusive-ish end for Convex string prefix indexes. */
export function stringPrefixRange(prefix: string): {
  start: string;
  end: string;
} {
  return { start: prefix, end: `${prefix}\uffff` };
}

export async function collectAthleteSearchPool(
  ctx: QueryCtx,
  term: string,
): Promise<Doc<"users">[]> {
  const needle = term.trim().toLowerCase().replace(/^@/, "");
  const byId = new Map<Id<"users">, Doc<"users">>();
  const add = (users: Doc<"users">[]) => {
    for (const user of users) byId.set(user._id, user);
  };

  if (!needle) {
    add(await ctx.db.query("users").order("desc").take(SEARCH_POOL));
    return [...byId.values()];
  }

  const { start, end } = stringPrefixRange(needle);
  add(
    await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.gte("handle", start).lt("handle", end))
      .take(SEARCH_POOL),
  );

  const nameQuery = needle
    .replace(/[^a-z0-9_ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (nameQuery.length >= 2) {
    add(
      await ctx.db
        .query("users")
        .withSearchIndex("search_displayName", (q) =>
          q.search("displayName", nameQuery),
        )
        .take(MATCH_TAKE),
    );
  }

  return [...byId.values()];
}

export function rankAthleteSearchResults(
  users: Doc<"users">[],
  viewerId: Id<"users">,
  term: string,
): Doc<"users">[] {
  const needle = term.trim().toLowerCase().replace(/^@/, "");
  const searchable = users.filter((u) => isSearchableAthlete(u, viewerId));
  const matches = needle
    ? searchable.filter((u) => matchesAthleteSearch(u, needle))
    : searchable;
  return matches.slice(0, SEARCH_LIMIT);
}

export async function allocateUniqueHandle(
  ctx: MutationCtx,
  email: string,
  excludeUserId?: Id<"users">,
): Promise<string | null> {
  const base = handleBaseFromEmail(email);
  for (let i = 0; i < 100; i++) {
    const suffix = i === 0 ? "" : `_${i}`;
    const candidate = `${base.slice(0, 24 - suffix.length)}${suffix}`;
    if (!isValidHandle(candidate) || isReservedHandle(candidate)) continue;
    const taken = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", candidate))
      .unique();
    if (!taken || taken._id === excludeUserId) return candidate;
  }
  return null;
}
