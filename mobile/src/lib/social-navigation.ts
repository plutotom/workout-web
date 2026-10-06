import type { Id } from "@backend/dataModel";
import { router } from "expo-router";

export function openSocialPost(postId: Id<"activityPosts">) {
  router.push(
    { pathname: "/social/post/[postId]", params: { postId } },
    { dangerouslySingular: true },
  );
}

export function showPublishedPost(postId: Id<"activityPosts">) {
  // Drop the workout/recap/composer stack before opening the published post.
  // Expo Router queues these in order, resolving each against the updated stack.
  router.dismissTo("/social");
  router.push(
    { pathname: "/social/post/[postId]", params: { postId, fromShare: "1" } },
    { dangerouslySingular: true },
  );
}

export function leaveSocialPost(fromShare = false) {
  if (fromShare || !router.canGoBack()) {
    router.dismissTo("/social");
  } else {
    router.back();
  }
}
