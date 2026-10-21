import { EXERCISES, exerciseUsesBar } from "../../src/lib/exercises";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  createCustomExercise,
  customSlug,
  normalizeExerciseName,
} from "./exercises";

function matchingName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function ambiguous(slugs: string[]): never {
  throw new Error(
    `Multiple exercises match. Reuse an existing slug from list_exercises instead of creating another exercise. Matches: ${slugs.slice(0, 10).join(", ")}`,
  );
}

/** MCP creation is reuse-first. Existing history and prescriptions keep their identity. */
export async function ensureMcpExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: Parameters<typeof createCustomExercise>[2],
) {
  const name = matchingName(normalizeExerciseName(args.name));
  const owned = await ctx.db
    .query("customExercises")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const named = owned.filter((row) => matchingName(row.name) === name);
  const exact = named.filter(
    (row) => row.category === args.category && row.usesBar === args.usesBar,
  );
  const active = exact.filter((row) => !row.archived);
  const candidates = active.length ? active : exact;
  if (candidates.length > 1)
    ambiguous(candidates.map((row) => customSlug(row._id)));
  const existing = candidates[0];
  if (existing) {
    if (existing.archived)
      await ctx.db.patch(existing._id, { archived: false });
    return {
      id: existing._id,
      slug: customSlug(existing._id),
      source: "custom" as const,
      reused: true,
      restored: existing.archived,
    };
  }

  const catalogNamed = EXERCISES.filter(
    (row) => matchingName(row.name) === name,
  );
  const catalogMatches = catalogNamed.filter(
    (row) =>
      row.category === args.category &&
      exerciseUsesBar(row.slug) === args.usesBar,
  );
  if (catalogMatches.length > 1)
    ambiguous(catalogMatches.map((row) => row.slug));
  if (catalogMatches[0]) {
    return {
      id: null,
      slug: catalogMatches[0].slug,
      source: "catalog" as const,
      reused: true,
      restored: false,
    };
  }
  if (named.length || catalogNamed.length) {
    throw new Error(
      "An exercise with this name already exists with different equipment or muscle group. Check list_exercises and reuse its slug, or give an intentionally different variation a distinct name.",
    );
  }
  const created = await createCustomExercise(ctx, userId, args);
  return {
    ...created,
    source: "custom" as const,
    reused: false,
    restored: false,
  };
}
