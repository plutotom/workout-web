import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_NOTE_LENGTH = 500;
const MAX_SLUG_LENGTH = 64;
const MAX_SLUGS_PER_READ = 100;

function normalizeNote(notes: string): string {
  return notes.trim().slice(0, MAX_NOTE_LENGTH);
}

export async function getNotesBySlugs(
  ctx: QueryCtx,
  userId: Id<"users">,
  slugs: string[],
): Promise<Record<string, string>> {
  if (slugs.length > MAX_SLUGS_PER_READ) {
    throw new Error(
      `At most ${MAX_SLUGS_PER_READ} exercise notes can be read at once`,
    );
  }
  const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
  if (!unique.length) return {};

  const entries = await Promise.all(
    unique.map(async (exerciseSlug) => {
      const doc = await ctx.db
        .query("exerciseNotes")
        .withIndex("by_user_slug", (q) =>
          q.eq("userId", userId).eq("exerciseSlug", exerciseSlug),
        )
        .unique();
      return doc ? ([exerciseSlug, doc.notes] as const) : null;
    }),
  );

  return Object.fromEntries(
    entries.filter((e): e is [string, string] => e !== null),
  );
}

export async function upsertExerciseNote(
  ctx: MutationCtx,
  userId: Id<"users">,
  exerciseSlug: string,
  notes: string,
) {
  const slug = exerciseSlug.trim();
  if (!slug) throw new Error("Exercise slug is required");
  if (slug.length > MAX_SLUG_LENGTH) {
    throw new Error(
      `Exercise slug must be at most ${MAX_SLUG_LENGTH} characters`,
    );
  }

  const normalized = normalizeNote(notes);
  const existing = await ctx.db
    .query("exerciseNotes")
    .withIndex("by_user_slug", (q) =>
      q.eq("userId", userId).eq("exerciseSlug", slug),
    )
    .unique();

  if (!normalized) {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }

  if (existing) {
    await ctx.db.patch(existing._id, { notes: normalized });
    return;
  }

  await ctx.db.insert("exerciseNotes", {
    userId,
    exerciseSlug: slug,
    notes: normalized,
  });
}
