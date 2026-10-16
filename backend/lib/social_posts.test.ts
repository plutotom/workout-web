import { describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { PORTABLE_FORMAT, PORTABLE_VERSION } from "../schemas/portable";
import {
  buildSessionShareBundle,
  refreshActivityPostForSession,
} from "./social_posts";

const userId = "user-1" as Id<"users">;
const sessionId = "session-1" as Id<"workoutSessions">;
const postId = "post-1" as Id<"activityPosts">;

function sessionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: sessionId,
    userId,
    templateName: "Push",
    status: "completed",
    startedAt: 100,
    completedAt: 200,
    ...overrides,
  } as Doc<"workoutSessions">;
}

function ctxWithLifts(opts: {
  exercises: Array<{
    _id: string;
    slug: string;
    orderIndex: number;
    sets: Array<{
      completed: boolean;
      weight: number;
      reps: number;
      orderIndex: number;
    }>;
  }>;
  post?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
}) {
  const patch = vi.fn(async () => {});
  const insert = vi.fn(async () => "inserted");
  const user = opts.user ?? { _id: userId, unit: "lb" };
  const session = sessionDoc();
  const post =
    opts.post === undefined
      ? { _id: postId, userId, sessionId, caption: "felt strong", bundle: {} }
      : opts.post;
  const ctx = {
    db: {
      normalizeId() {
        return null;
      },
      async get(id: string) {
        if (id === sessionId) return session;
        if (id === userId) return user;
        return null;
      },
      query(table: string) {
        return {
          withIndex() {
            return this;
          },
          async unique() {
            return table === "activityPosts" ? post : null;
          },
          async take() {
            if (table === "sessionExercises") {
              return opts.exercises.map((exercise) => ({
                _id: exercise._id,
                exerciseSlug: exercise.slug,
                orderIndex: exercise.orderIndex,
              }));
            }
            if (table === "sets") {
              return opts.exercises.flatMap((exercise) =>
                exercise.sets.map((set) => ({
                  ...set,
                  sessionExerciseId: exercise._id,
                })),
              );
            }
            return [];
          },
        };
      },
      patch,
      insert,
    },
  } as unknown as MutationCtx;
  return { ctx, patch, insert };
}

describe("buildSessionShareBundle", () => {
  it("keeps only checked-off sets so unchecking cannot double-count", async () => {
    const { ctx } = ctxWithLifts({
      exercises: [
        {
          _id: "ex-1",
          slug: "bench-press",
          orderIndex: 0,
          sets: [
            { completed: true, weight: 185, reps: 5, orderIndex: 0 },
            { completed: false, weight: 225, reps: 3, orderIndex: 1 },
            { completed: true, weight: 135, reps: 8, orderIndex: 2 },
          ],
        },
      ],
    });
    const bundle = await buildSessionShareBundle(
      ctx,
      { _id: userId, unit: "lb" },
      sessionDoc(),
    );
    expect(bundle).toMatchObject({
      format: PORTABLE_FORMAT,
      version: PORTABLE_VERSION,
      unit: "lb",
    });
    expect(bundle.templates[0]?.exercises[0]?.sets).toEqual([
      { weight: 185, reps: 5 },
      { weight: 135, reps: 8 },
    ]);
  });
});

describe("refreshActivityPostForSession", () => {
  it("rewrites the existing post bundle in place and never inserts another", async () => {
    const fixture = ctxWithLifts({
      exercises: [
        {
          _id: "ex-1",
          slug: "bench-press",
          orderIndex: 0,
          sets: [{ completed: true, weight: 195, reps: 5, orderIndex: 0 }],
        },
      ],
    });
    await refreshActivityPostForSession(fixture.ctx, userId, sessionId);
    expect(fixture.insert).not.toHaveBeenCalled();
    expect(fixture.patch).toHaveBeenCalledTimes(1);
    expect(fixture.patch).toHaveBeenCalledWith(
      postId,
      expect.objectContaining({
        bundle: expect.objectContaining({
          templates: [
            expect.objectContaining({
              name: "Push",
              exercises: [
                expect.objectContaining({
                  slug: "bench-press",
                  sets: [{ weight: 195, reps: 5 }],
                }),
              ],
            }),
          ],
        }),
      }),
    );
    expect(
      (fixture.patch.mock.calls as unknown as Array<[string, object]>)[0][1],
    ).not.toHaveProperty("caption");
  });

  it("no-ops when the session has no feed post", async () => {
    const fixture = ctxWithLifts({
      exercises: [],
      post: null,
    });
    await refreshActivityPostForSession(fixture.ctx, userId, sessionId);
    expect(fixture.patch).not.toHaveBeenCalled();
    expect(fixture.insert).not.toHaveBeenCalled();
  });
});
