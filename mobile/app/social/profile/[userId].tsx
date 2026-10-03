import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Text, View } from "react-native";

import { SocialPost } from "@/components/social-post";
import {
  Button,
  EmptyState,
  FullScreenLoader,
  PageHeader,
  Screen,
} from "@/components/ui";
import { useMobileAuth } from "@/auth/auth-provider";
import { optimisticFollow } from "@/lib/social-optimistic";
import { measureMobileAsync } from "@/lib/performance-timing";
import { useCommitTiming, useLoadTiming } from "@/lib/use-performance-timing";
import { colors } from "@/theme";

export default function ProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const id = userId as Id<"users">;
  const { isAuthenticated, accountStatus } = useMobileAuth();
  const profile = useQuery(
    api.routes.social.queries.profile,
    isAuthenticated ? { userId: id } : "skip",
  );
  const posts = useQuery(
    api.routes.social.queries.profilePosts,
    isAuthenticated ? { userId: id } : "skip",
  );
  const follow = useMutation(
    api.routes.social.mutations.toggleFollow,
  ).withOptimisticUpdate(optimisticFollow);
  const measureFollowCommit = useCommitTiming("social.follow.ui_commit");
  useLoadTiming("social.profile", isAuthenticated, profile !== undefined, id);
  useLoadTiming("social.posts", isAuthenticated, posts !== undefined, id);
  if (
    accountStatus === "connecting" ||
    (isAuthenticated && profile === undefined)
  ) {
    return <FullScreenLoader label="Loading profile…" />;
  }
  return (
    <Screen>
      <PageHeader back title="Profile" />
      {!profile ? (
        profile === null || !isAuthenticated ? (
          <EmptyState
            title="Profile unavailable"
            description="This athlete could not be found."
          />
        ) : null
      ) : (
        <>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}>
            {profile.name}
          </Text>
          <Text style={{ color: colors.dim, marginTop: 4 }}>
            {profile.handle ? `@${profile.handle}` : "No username yet"}
          </Text>
          {profile.bio ? (
            <Text style={{ color: colors.text, marginTop: 14 }}>
              {profile.bio}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 24, marginVertical: 18 }}>
            <Text style={{ color: colors.text }}>
              {profile.followerCount} followers
            </Text>
            <Text style={{ color: colors.text }}>
              {profile.followingCount} following
            </Text>
          </View>
          {profile.isSelf ? (
            <Button
              label="Edit profile"
              variant="outline"
              onPress={() => router.push("/social/edit-profile")}
            />
          ) : (
            <Button
              label={profile.isFollowing ? "Following" : "Follow"}
              variant={profile.isFollowing ? "outline" : "primary"}
              onPress={() => {
                measureFollowCommit();
                void measureMobileAsync("social.follow.confirmation", () =>
                  follow({ userId: id }),
                ).catch((e) =>
                  Alert.alert("Couldn't update follow", String(e)),
                );
              }}
            />
          )}
          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "700",
              marginTop: 26,
              marginBottom: 12,
            }}
          >
            Shared workouts
          </Text>
          {posts?.length === 0 ? (
            <Text style={{ color: colors.dim }}>No shared workouts yet.</Text>
          ) : null}
          {posts?.map((post) => (
            <SocialPost key={post.id} post={post} />
          ))}
        </>
      )}
    </Screen>
  );
}
