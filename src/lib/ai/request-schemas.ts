import { z } from "zod";

/**
 * Request contracts for the AI generate routes, kept beside the byte caps that
 * bound them. The two have to agree: a body the schema accepts but the cap
 * rejects surfaces to the user as an opaque 413 they cannot act on, so
 * `request-schemas.test.ts` builds the largest body each schema permits and
 * asserts it still fits. Widen a bound and that test tells you to revisit the
 * cap rather than letting the mismatch reach production.
 */

export const AI_MAX_PROMPT_CHARS = 2_000;
export const AI_MAX_SLUG_CHARS = 64;
export const AI_MAX_EXERCISES = 50;
export const AI_MAX_SETS = 20;
export const AI_MAX_TEMPLATE_NAME_CHARS = 100;

const promptSchema = z.string().trim().min(1).max(AI_MAX_PROMPT_CHARS);
const slugSchema = z.string().trim().min(1).max(AI_MAX_SLUG_CHARS);

/**
 * The session route summarises progress as "done/total sets" and matches on
 * slug; it never reads the weight or reps of a set. Sending set counts instead
 * of set rows keeps ~45KB of unused numbers off the wire — which matters most
 * on the native client's cellular connection — without changing a byte of the
 * prompt the model receives.
 */
export const sessionRequestSchema = z.object({
  prompt: promptSchema,
  current: z.object({
    exercises: z
      .array(
        z
          .object({
            slug: slugSchema,
            done: z.number().int().min(0).max(AI_MAX_SETS),
            total: z.number().int().min(0).max(AI_MAX_SETS),
          })
          .refine((exercise) => exercise.done <= exercise.total, {
            message: "done cannot exceed total",
          }),
      )
      .max(AI_MAX_EXERCISES),
  }),
});

export type SessionRequest = z.infer<typeof sessionRequestSchema>;

/**
 * The template route serialises `current` straight into the prompt for edit
 * mode, so unlike the session route it genuinely needs every set value.
 */
export const templateRequestSchema = z.object({
  prompt: promptSchema,
  mode: z.enum(["create", "edit"]).default("create"),
  current: z
    .object({
      name: z.string().max(AI_MAX_TEMPLATE_NAME_CHARS),
      exercises: z
        .array(
          z.object({
            slug: slugSchema,
            sets: z
              .array(
                z.object({
                  weight: z.number().finite().min(0).max(10_000),
                  reps: z.number().finite().min(0).max(1_000),
                }),
              )
              .max(AI_MAX_SETS),
          }),
        )
        .max(AI_MAX_EXERCISES),
    })
    .optional(),
});

export type TemplateRequest = z.infer<typeof templateRequestSchema>;

/**
 * Byte caps, sized from the worst case each schema allows (see the test) with
 * room to spare. Auth runs before the body is read, so these bound what a
 * signed-in user can push rather than acting as front-line DoS protection.
 */
export const SESSION_BODY_LIMIT_BYTES = 16_384;
export const TEMPLATE_BODY_LIMIT_BYTES = 65_536;
