import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation } from "convex/react";
import { router } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import { Alert, Pressable, Text, View } from "react-native";

import { CowboyHatIcon } from "@/components/cowboy-hat-icon";
import { Button, Card } from "@/components/ui";
import { colors } from "@/theme";

type Post = {
  id: Id<"activityPosts">;
  userId: Id<"users">;
  name: string;
  handle: string | null;
  title: string;
  caption: string;
  completedAt: number;
  durationSeconds: number;
  exerciseCount: number;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  exercises: { name: string; sets: number }[];
};

export function SocialPost({
  post,
  detail = false,
}: {
  post: Post;
  detail?: boolean;
}) {
  const like = useMutation(api.routes.social.mutations.toggleLike);
  const copy = useMutation(api.routes.social.mutations.copyWorkout);
  const open = () => {
    if (detail) return;
    router.push({
      pathname: "/social/post/[postId]",
      params: { postId: post.id },
    });
  };
  const workout = (
    <>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 20 }}>
        {post.title}
      </Text>
      <Text style={{ color: colors.dim, marginTop: 4 }}>
        {post.exerciseCount} exercises · {Math.round(post.durationSeconds / 60)}{" "}
        min
      </Text>
      {post.caption ? (
        <Text style={{ color: colors.text, marginTop: 8 }}>{post.caption}</Text>
      ) : null}
      {detail
        ? post.exercises.map((exercise, i) => (
            <Text
              key={`${i}-${exercise.name}`}
              style={{ color: colors.dim, marginTop: 6 }}
            >
              {exercise.name} · {exercise.sets} sets
            </Text>
          ))
        : null}
    </>
  );
  return (
    <Card style={{ gap: 12, marginBottom: 12 }}>
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/social/profile/[userId]",
            params: { userId: post.userId },
          })
        }
      >
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
          {post.name}
        </Text>
        <Text style={{ color: colors.dim, fontSize: 12 }}>
          {post.handle ? `@${post.handle} · ` : ""}
          {new Date(post.completedAt).toLocaleDateString()}
        </Text>
      </Pressable>
      {detail ? (
        <View>{workout}</View>
      ) : (
        <Pressable onPress={open}>{workout}</Pressable>
      )}
      <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.liked ? "Remove yee haw" : "Give a yee haw"}
          onPress={() =>
            void like({ postId: post.id }).catch((e) =>
              Alert.alert("Couldn't yee haw", String(e)),
            )
          }
          style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
        >
          <CowboyHatIcon
            size={20}
            color={post.liked ? colors.action : colors.dim}
            fill={post.liked ? colors.action : "none"}
          />
          <Text style={{ color: colors.text }}>{post.likeCount}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View comments"
          disabled={detail}
          onPress={open}
          style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
        >
          <MessageCircle size={20} color={colors.dim} />
          <Text style={{ color: colors.text }}>{post.commentCount}</Text>
        </Pressable>
      </View>
      <Button
        label="Copy as template"
        variant="outline"
        size="sm"
        onPress={async () => {
          try {
            await copy({ postId: post.id });
            Alert.alert("Saved", "This workout is now in your templates.");
          } catch (error) {
            Alert.alert(
              "Couldn't copy workout",
              error instanceof Error ? error.message : "Please try again.",
            );
          }
        }}
      />
    </Card>
  );
}
