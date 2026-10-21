import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useConvexConnectionState, useMutation } from "convex/react";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { MessageCircle, MoreHorizontal } from "lucide-react-native";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { useCallback, useRef, useState } from "react";

import { CowboyHatIcon } from "@/components/cowboy-hat-icon";
import { Card } from "@/components/ui";
import { colors } from "@/theme";
import { optimisticLike } from "@/lib/social-optimistic";
import { measureMobileAsync } from "@/lib/performance-timing";
import { useCommitTiming } from "@/lib/use-performance-timing";
import { openSocialPost } from "@/lib/social-navigation";

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

type PostOption = {
  label: string;
  onPress: () => void;
};

export function showPostOptions(actions: PostOption[], onClose?: () => void) {
  if (actions.length === 0) {
    onClose?.();
    return;
  }

  const options = ["Cancel", ...actions.map((action) => action.label)];
  const finish = (index?: number) => {
    onClose?.();
    if (index == null || index === 0) return;
    actions[index - 1]?.onPress();
  };

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
      },
      finish,
    );
    return;
  }

  Alert.alert("Post options", undefined, [
    { text: "Cancel", style: "cancel", onPress: () => finish(0) },
    ...actions.map((action, index) => ({
      text: action.label,
      onPress: () => finish(index + 1),
    })),
  ]);
}

export function SocialPost({
  post,
  detail = false,
}: {
  post: Post;
  detail?: boolean;
}) {
  const like = useMutation(
    api.routes.social.mutations.toggleLike,
  ).withOptimisticUpdate(optimisticLike);
  const copy = useMutation(api.routes.social.mutations.copyWorkout);
  const { isWebSocketConnected } = useConvexConnectionState();
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyInFlight = useRef(false);
  const confirmationOpen = useRef(false);
  const menuOpen = useRef(false);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const measureLikeCommit = useCommitTiming("social.like.ui_commit");
  const measureCopyCommit = useCommitTiming("social.copy.ui_commit");
  const addTemplate = async () => {
    if (copyInFlight.current || !focused.current) return;
    copyInFlight.current = true;
    measureCopyCommit();
    setCopyError(null);
    setCopying(true);
    try {
      await measureMobileAsync("social.copy.confirmation", () =>
        copy({ postId: post.id }),
      );
      if (focused.current)
        Alert.alert(
          "Added to library",
          "This workout is now in your template library.",
        );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      setCopyError(message);
      if (focused.current) Alert.alert("Couldn't add template", message);
    } finally {
      copyInFlight.current = false;
      setCopying(false);
    }
  };
  const confirmCopy = () => {
    if (copyInFlight.current || confirmationOpen.current) return;
    confirmationOpen.current = true;
    Alert.alert(
      "Add to your library?",
      `Add “${post.title}” as a new workout template?`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            confirmationOpen.current = false;
          },
        },
        {
          text: "Add template",
          onPress: () => {
            confirmationOpen.current = false;
            return addTemplate();
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          confirmationOpen.current = false;
        },
      },
    );
  };
  const openMenu = () => {
    if (
      copying ||
      copyInFlight.current ||
      confirmationOpen.current ||
      menuOpen.current
    )
      return;
    menuOpen.current = true;
    showPostOptions(
      [{ label: "Copy as template", onPress: confirmCopy }],
      () => {
        menuOpen.current = false;
      },
    );
  };
  const open = () => {
    if (detail) return;
    openSocialPost(post.id);
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/social/profile/[userId]",
              params: { userId: post.userId },
            })
          }
          style={{ flex: 1, minWidth: 0 }}
        >
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
            {post.name}
          </Text>
          <Text style={{ color: colors.dim, fontSize: 12 }}>
            {post.handle ? `@${post.handle} · ` : ""}
            {new Date(post.completedAt).toLocaleDateString()}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post options"
          accessibilityState={{ disabled: copying }}
          disabled={copying}
          hitSlop={10}
          onPress={openMenu}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed || copying ? 0.7 : 1,
          })}
        >
          <MoreHorizontal size={20} color={colors.dim} />
        </Pressable>
      </View>
      {detail ? (
        <View>{workout}</View>
      ) : (
        <Pressable onPress={open}>{workout}</Pressable>
      )}
      <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.liked ? "Remove yee haw" : "Give a yee haw"}
          accessibilityState={{ selected: post.liked }}
          hitSlop={10}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            measureLikeCommit();
            void measureMobileAsync("social.like.confirmation", () =>
              like({ postId: post.id }),
            ).catch((e) => Alert.alert("Couldn't yee haw", String(e)));
          }}
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
      {copying ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <ActivityIndicator
            accessibilityLabel="Adding template to library"
            color={colors.text}
          />
          <Text accessibilityLiveRegion="polite" style={{ color: colors.dim }}>
            {isWebSocketConnected
              ? "Adding to your library…"
              : "Waiting for connection…"}
          </Text>
        </View>
      ) : null}
      {copyError && !copying ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {copyError}
        </Text>
      ) : null}
    </Card>
  );
}
