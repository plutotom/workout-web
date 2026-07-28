import { defineTable } from "convex/server";
import { v } from "convex/values";

import { exerciseSlugValidator, muscleGroupValidator } from "./exercises";
import { unitValidator } from "./users";

/**
 * Portable template bundle — the wire format shared by every transport
 * (share link, `.json` file, pasted code) and by both clients.
 *
 * This validator is the single source of truth for the shape. The web/mobile
 * helper in `src/lib/workout-export.ts` derives its TypeScript type from it via
 * a type-only import, so the two can never drift.
 */
export const PORTABLE_FORMAT = "workout.export";
export const PORTABLE_VERSION = 1;

/**
 * One exercise inside an exported template.
 *
 * `slug` is the sender's identifier and `name` is the human-readable fallback.
 * Both travel because a slug is only meaningful to the sender: `custom:<id>`
 * slugs point at a row the recipient cannot read, and a curated slug may not
 * exist yet in an older client's catalog. The importer resolves by slug first
 * and falls back to recreating from `name` + `category`.
 */
const portableExerciseValidator = v.object({
  slug: exerciseSlugValidator,
  name: v.string(),
  sets: v.array(v.object({ weight: v.number(), reps: v.number() })),
  notes: v.optional(v.string()),
});

const portableTemplateValidator = v.object({
  name: v.string(),
  exercises: v.array(portableExerciseValidator),
});

/**
 * Definition for a `custom:<id>` slug referenced by an exported template, so
 * the recipient can recreate the lift under their own account instead of
 * importing a dangling slug.
 */
const portableCustomExerciseValidator = v.object({
  slug: exerciseSlugValidator,
  name: v.string(),
  short: v.optional(v.string()),
  category: muscleGroupValidator,
  usesBar: v.boolean(),
});

export const portableBundleValidator = v.object({
  format: v.literal(PORTABLE_FORMAT),
  version: v.literal(PORTABLE_VERSION),
  exportedAt: v.number(),
  /** Sender's weight unit, so the importer can convert to theirs. */
  unit: unitValidator,
  templates: v.array(portableTemplateValidator),
  customExercises: v.array(portableCustomExerciseValidator),
});

/**
 * A share link's payload. The bundle is snapshotted at creation time so the
 * link keeps working (and keeps showing what was sent) even if the sender later
 * edits or deletes the template.
 */
export const shareTables = {
  templateShares: defineTable({
    userId: v.id("users"),
    /** URL-safe secret. Anyone holding it can read the bundle — see lib/shares. */
    token: v.string(),
    /** Sender's display label, shown on the public preview page. */
    sharedBy: v.optional(v.string()),
    bundle: portableBundleValidator,
    createdAt: v.number(),
    /** Absent means no expiry. */
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    /** Bumped by the authenticated import mutation, so the sender can see
     *  whether the link was actually used. Reads are deliberately not counted:
     *  the preview is unauthenticated, and a public write endpoint just to
     *  increment a counter is an abuse vector for no real benefit. */
    importCount: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),
};
