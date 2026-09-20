import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Text, View } from "react-native";

import { SocialPost } from "@/components/social-post";
import { Button, EmptyState, PageHeader, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function ProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const id = userId as Id<"users">;
  const profile = useQuery(api.routes.social.queries.profile, { userId: id });
  const posts = useQuery(api.routes.social.queries.profilePosts, {
    userId: id,
  });
  const follow = useMutation(api.routes.social.mutations.toggleFollow);
  return (
    <Screen>
      <PageHeader back title="Profile" />
      {!profile ? (
        profile === null ? (
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
              onPress={() =>
                void follow({ userId: id }).catch((e) =>
                  Alert.alert("Couldn't update follow", String(e)),
                )
              }
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
