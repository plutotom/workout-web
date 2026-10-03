import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { Value } from "convex/values";
import { describe, expect, it, vi } from "vitest";

import type { QueryResultsMap } from "../../../node_modules/convex/dist/cjs-types/browser/sync/optimistic_updates_impl";
import { api } from "../../../backend/_generated/api";
import type { Id } from "../../../backend/_generated/dataModel";
import {
  optimisticComment,
  optimisticFollow,
  optimisticLike,
  optimisticReadNotifications,
  optimisticRemoveComment,
} from "./social-optimistic";

vi.mock("@backend/api", async () => import("../../../backend/_generated/api"));

// Exercise the installed client's actual optimistic replay/settlement without
// compiling Convex's source with Expo's different TypeScript version.
const { OptimisticQueryResults } = await vi.importActual<
  typeof import("../../../node_modules/convex/dist/cjs-types/browser/sync/optimistic_updates_impl")
>(
  "../../../node_modules/convex/dist/esm/browser/sync/optimistic_updates_impl.js",
);
const { serializePathAndArgs } = await vi.importActual<
  typeof import("../../../node_modules/convex/dist/cjs-types/browser/sync/udf_path_utils")
>("../../../node_modules/convex/dist/esm/browser/sync/udf_path_utils.js");

const queries = api.routes.social.queries;
const postId = "post_1" as Id<"activityPosts">;
const authorId = "author_1" as Id<"users">;
const viewerId = "viewer_1" as Id<"users">;
const commentId = "comment_1" as Id<"activityComments">;
const post = {
  id: postId,
  userId: authorId,
  name: "Athlete",
  handle: "athlete",
  title: "Leg day",
  caption: "",
  completedAt: 100,
  durationSeconds: 60,
  exerciseCount: 1,
  likeCount: 2,
  commentCount: 1,
  liked: false,
  exercises: [{ name: "Squat", sets: 3 }],
};

function harness() {
  const server: QueryResultsMap = new Map();
  const client = new OptimisticQueryResults();
  const key = (
    query: FunctionReference<"query">,
    args: Record<string, Value>,
  ) => serializePathAndArgs(getFunctionName(query), args);
  function seed(
    query: FunctionReference<"query">,
    args: Record<string, Value>,
    value: Value,
  ) {
    server.set(key(query, args), {
      udfPath: getFunctionName(query),
      args,
      result: { success: true, value, logLines: [] },
    });
    client.ingestQueryResultsFromServer(server, new Set());
  }
  function read(
    query: FunctionReference<"query">,
    args: Record<string, Value> = {},
  ) {
    return client.queryResult(key(query, args));
  }
  function settle(ids: number[]) {
    client.ingestQueryResultsFromServer(server, new Set(ids));
  }
  seed(queries.feed, {}, [post]);
  seed(queries.profilePosts, { userId: authorId }, [post]);
  seed(queries.post, { postId }, post);
  seed(queries.me, {}, { id: viewerId, name: "Me", handle: "me", bio: "" });
  seed(queries.comments, { postId }, [
    {
      id: commentId,
      userId: authorId,
      name: "Athlete",
      text: "Nice!",
      createdAt: 100,
    },
  ]);
  return { client, seed, read, settle };
}

describe("social actions before the server responds", () => {
  it("updates all visible copies immediately and rolls back a rejected like", () => {
    const h = harness();
    h.client.applyOptimisticUpdate(
      (store) => optimisticLike(store, { postId }),
      1,
    );
    const liked = { ...post, liked: true, likeCount: 3 };
    expect(h.read(queries.feed)).toEqual([liked]);
    expect(h.read(queries.profilePosts, { userId: authorId })).toEqual([liked]);
    expect(h.read(queries.post, { postId })).toEqual(liked);
    h.settle([1]);
    expect(h.read(queries.feed)).toEqual([post]);
    expect(h.read(queries.post, { postId })).toEqual(post);
  });

  it("preserves rapid toggle ordering as the first like settles", () => {
    const h = harness();
    h.client.applyOptimisticUpdate(
      (store) => optimisticLike(store, { postId }),
      1,
    );
    h.client.applyOptimisticUpdate(
      (store) => optimisticLike(store, { postId }),
      2,
    );
    expect(h.read(queries.post, { postId })).toEqual(post);
    h.seed(queries.post, { postId }, { ...post, liked: true, likeCount: 3 });
    h.settle([1]);
    expect(h.read(queries.post, { postId })).toEqual(post);
    h.seed(queries.post, { postId }, post);
    h.settle([2]);
    expect(h.read(queries.post, { postId })).toEqual(post);
  });

  it("updates follow state and both people's counts, then restores them on failure", () => {
    const h = harness();
    const target = {
      id: authorId,
      name: "Athlete",
      handle: "athlete",
      bio: "",
      followerCount: 4,
      followingCount: 1,
      isFollowing: false,
      isSelf: false,
    };
    const self = { ...target, id: viewerId, isSelf: true, followingCount: 2 };
    h.seed(queries.profile, { userId: authorId }, target);
    h.seed(queries.profile, {}, self);
    h.client.applyOptimisticUpdate(
      (store) => optimisticFollow(store, { userId: authorId }),
      1,
    );
    expect(h.read(queries.profile, { userId: authorId })).toMatchObject({
      isFollowing: true,
      followerCount: 5,
    });
    expect(h.read(queries.profile)).toMatchObject({ followingCount: 3 });
    h.settle([1]);
    expect(h.read(queries.profile, { userId: authorId })).toEqual(target);
    expect(h.read(queries.profile)).toEqual(self);
  });

  it("shows the pending comment and count immediately without duplicating it on confirmation", () => {
    const h = harness();
    h.client.applyOptimisticUpdate(
      (store) =>
        optimisticComment(store, { postId, text: "  Great workout!  " }),
      1,
    );
    expect(h.read(queries.comments, { postId })).toEqual([
      expect.objectContaining({ id: commentId }),
      expect.objectContaining({
        id: expect.stringMatching(/^optimistic:/),
        userId: viewerId,
        text: "Great workout!",
      }),
    ]);
    expect(h.read(queries.post, { postId })).toMatchObject({ commentCount: 2 });
    h.seed(queries.comments, { postId }, [
      {
        id: commentId,
        userId: authorId,
        name: "Athlete",
        text: "Nice!",
        createdAt: 100,
      },
      {
        id: "comment_2",
        userId: viewerId,
        name: "Me",
        text: "Great workout!",
        createdAt: 200,
      },
    ]);
    h.seed(queries.post, { postId }, { ...post, commentCount: 2 });
    h.settle([1]);
    expect(h.read(queries.comments, { postId })).toHaveLength(2);
    expect(h.read(queries.comments, { postId })).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.stringMatching(/^optimistic:/) }),
      ]),
    );
    expect(h.read(queries.post, { postId })).toMatchObject({ commentCount: 2 });
  });

  it("rolls back failed comment creation and deletion, including counts", () => {
    const h = harness();
    h.client.applyOptimisticUpdate(
      (store) => optimisticComment(store, { postId, text: "Nice work" }),
      1,
    );
    h.settle([1]);
    expect(h.read(queries.comments, { postId })).toHaveLength(1);
    expect(h.read(queries.post, { postId })).toEqual(post);
    h.client.applyOptimisticUpdate(
      (store) => optimisticRemoveComment(store, { commentId }),
      2,
    );
    expect(h.read(queries.comments, { postId })).toEqual([]);
    expect(h.read(queries.feed)).toEqual([{ ...post, commentCount: 0 }]);
    h.settle([2]);
    expect(h.read(queries.comments, { postId })).toHaveLength(1);
    expect(h.read(queries.post, { postId })).toEqual(post);
  });

  it("does not invent signed-in data when queries are loading or the account is absent", () => {
    const h = harness();
    h.seed(queries.me, {}, null);
    h.client.applyOptimisticUpdate((store) => {
      optimisticComment(store, { postId, text: "Hello" });
      optimisticFollow(store, { userId: authorId });
      optimisticLike(store, { postId: "missing" as Id<"activityPosts"> });
      optimisticReadNotifications(store);
    }, 1);
    expect(h.read(queries.post, { postId })).toEqual(post);
    expect(h.read(queries.comments, { postId })).toHaveLength(1);
    expect(h.read(queries.profile, { userId: authorId })).toBeUndefined();
  });
});
