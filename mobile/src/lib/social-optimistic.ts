import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";

type Post = NonNullable<
  FunctionReturnType<typeof api.routes.social.queries.post>
>;
const queries = api.routes.social.queries;

/** Keep every visible copy of a post in sync; Convex handles replay and rollback. */
function updatePost(
  store: OptimisticLocalStore,
  postId: Id<"activityPosts">,
  update: (post: Post) => Post,
) {
  for (const query of [queries.feed, queries.profilePosts]) {
    for (const { args, value } of store.getAllQueries(query)) {
      if (value?.some((post) => post.id === postId)) {
        store.setQuery(
          query,
          args,
          value.map((post) => (post.id === postId ? update(post) : post)),
        );
      }
    }
  }
  const post = store.getQuery(queries.post, { postId });
  if (post) store.setQuery(queries.post, { postId }, update(post));
}

export function optimisticLike(
  store: OptimisticLocalStore,
  { postId }: { postId: Id<"activityPosts"> },
) {
  updatePost(store, postId, (post) => ({
    ...post,
    liked: !post.liked,
    likeCount: Math.max(0, post.likeCount + (post.liked ? -1 : 1)),
  }));
}

export function optimisticFollow(
  store: OptimisticLocalStore,
  { userId }: { userId: Id<"users"> },
) {
  const profiles = store.getAllQueries(queries.profile);
  const target = profiles.find(({ value }) => value?.id === userId)?.value;
  if (!target || target.isSelf) return;
  const delta = target.isFollowing ? -1 : 1;
  for (const { args, value } of profiles) {
    if (!value) continue;
    if (value.id === userId) {
      store.setQuery(queries.profile, args, {
        ...value,
        isFollowing: !target.isFollowing,
        followerCount: Math.max(0, value.followerCount + delta),
      });
    } else if (value.isSelf) {
      store.setQuery(queries.profile, args, {
        ...value,
        followingCount: Math.max(0, value.followingCount + delta),
      });
    }
  }
}

export function optimisticComment(
  store: OptimisticLocalStore,
  { postId, text }: { postId: Id<"activityPosts">; text: string },
) {
  const me = store.getQuery(queries.me, {});
  const comments = store.getQuery(queries.comments, { postId });
  if (!me || !text.trim()) return;
  if (comments !== undefined) {
    store.setQuery(queries.comments, { postId }, [
      ...comments,
      {
        // This ID is local only and must never be passed to a server mutation.
        id: `optimistic:${postId}:${me.id}:${text}` as Id<"activityComments">,
        userId: me.id,
        name: me.name,
        text: text.trim(),
        createdAt: Date.now(),
      },
    ]);
  }
  updatePost(store, postId, (post) => ({
    ...post,
    commentCount: post.commentCount + 1,
  }));
}

export function optimisticRemoveComment(
  store: OptimisticLocalStore,
  { commentId }: { commentId: Id<"activityComments"> },
) {
  for (const { args, value } of store.getAllQueries(queries.comments)) {
    if (!value?.some((comment) => comment.id === commentId)) continue;
    store.setQuery(
      queries.comments,
      args,
      value.filter((comment) => comment.id !== commentId),
    );
    updatePost(store, args.postId, (post) => ({
      ...post,
      commentCount: Math.max(0, post.commentCount - 1),
    }));
  }
}

export function optimisticReadNotifications(store: OptimisticLocalStore) {
  const notifications = store.getQuery(queries.notifications, {});
  if (notifications) {
    store.setQuery(
      queries.notifications,
      {},
      notifications.map((notification) => ({ ...notification, read: true })),
    );
  }
}
