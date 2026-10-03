import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { SocialPost } from "@/components/social-post";
import {
  Button,
  EmptyState,
  FullScreenLoader,
  PageHeader,
  Screen,
} from "@/components/ui";
import { useMobileAuth } from "@/auth/auth-provider";
import {
  optimisticComment,
  optimisticRemoveComment,
} from "@/lib/social-optimistic";
import { colors } from "@/theme";
import { measureMobileAsync } from "@/lib/performance-timing";
import { useCommitTiming, useLoadTiming } from "@/lib/use-performance-timing";

export default function PostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const id = postId as Id<"activityPosts">;
  const { isAuthenticated, accountStatus } = useMobileAuth();
  const result = useQuery(
    api.routes.social.queries.post,
    isAuthenticated ? { postId: id } : "skip",
  );
  const feed = useQuery(
    api.routes.social.queries.feed,
    isAuthenticated ? {} : "skip",
  );
  // Feed rows already contain the full post preview: show it during navigation.
  const post =
    result === undefined && isAuthenticated
      ? feed?.find((row) => row.id === id)
      : result;
  const comments = useQuery(
    api.routes.social.queries.comments,
    isAuthenticated ? { postId: id } : "skip",
  );
  const me = useQuery(
    api.routes.social.queries.me,
    isAuthenticated ? {} : "skip",
  );
  const add = useMutation(
    api.routes.social.mutations.addComment,
  ).withOptimisticUpdate(optimisticComment);
  const remove = useMutation(
    api.routes.social.mutations.removeComment,
  ).withOptimisticUpdate(optimisticRemoveComment);
  const removePost = useMutation(api.routes.social.mutations.removePost);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const measureCommentCommit = useCommitTiming("social.comment.ui_commit");
  useLoadTiming("social.post", isAuthenticated, result !== undefined, id);
  useLoadTiming("social.comments", isAuthenticated, comments !== undefined, id);
  if (
    accountStatus === "connecting" ||
    (isAuthenticated && post === undefined)
  ) {
    return <FullScreenLoader label="Loading workout…" />;
  }
  return (
    <Screen>
      <PageHeader
        back
        title="Workout"
        action={
          post && post.userId === me?.id ? (
            <Button
              label="Delete post"
              size="sm"
              variant="ghost"
              onPress={() =>
                Alert.alert(
                  "Delete post?",
                  "Your logged workout will stay in your history.",
                  [
                    { text: "Cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () =>
                        void removePost({ postId: id })
                          .then(() => router.back())
                          .catch((e) =>
                            Alert.alert("Couldn't delete", String(e)),
                          ),
                    },
                  ],
                )
              }
            />
          ) : undefined
        }
      />
      {post === null || !isAuthenticated ? (
        <EmptyState
          title="Post unavailable"
          description="It may have been deleted."
        />
      ) : null}
      {post ? <SocialPost post={post} detail /> : null}
      {post ? (
        <>
          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "700",
              marginVertical: 12,
            }}
          >
            Comments
          </Text>
          {comments === undefined ? (
            <ActivityIndicator
              color={colors.text}
              accessibilityLabel="Loading comments"
            />
          ) : null}
          {comments?.map((c) => (
            <Pressable
              key={c.id}
              onLongPress={() => {
                if (c.id.startsWith("optimistic:")) return;
                if (c.userId === me?.id || post.userId === me?.id)
                  Alert.alert("Remove comment?", "This cannot be undone.", [
                    { text: "Cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () => {
                        void remove({ commentId: c.id }).catch((error) => {
                          Alert.alert(
                            "Couldn't remove comment",
                            error instanceof Error
                              ? error.message
                              : "Please try again.",
                          );
                        });
                      },
                    },
                  ]);
              }}
              style={{
                paddingVertical: 10,
                borderBottomColor: colors.line,
                borderBottomWidth: 1,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {c.name}
              </Text>
              <Text style={{ color: colors.text }}>{c.text}</Text>
              {c.id.startsWith("optimistic:") ? (
                <Text style={{ color: colors.dim, fontSize: 12 }}>
                  Sending…
                </Text>
              ) : null}
            </Pressable>
          ))}
          <View style={{ gap: 10, marginTop: 16 }}>
            <TextInput
              accessibilityLabel="Write a comment"
              placeholder="Leave a comment"
              placeholderTextColor={colors.dim}
              value={message}
              onChangeText={setMessage}
              maxLength={500}
              multiline
              style={{
                color: colors.text,
                borderColor: colors.line,
                borderWidth: 1,
                borderRadius: 12,
                padding: 14,
              }}
            />
            <Button
              label={sending ? "Posting…" : "Post comment"}
              disabled={
                !message.trim() || sending || !me || comments === undefined
              }
              onPress={async () => {
                if (sending || !message.trim()) return;
                const text = message;
                measureCommentCommit();
                setSending(true);
                setMessage("");
                try {
                  await measureMobileAsync("social.comment.confirmation", () =>
                    add({ postId: id, text }),
                  );
                } catch (e) {
                  setMessage((current) => current || text);
                  Alert.alert("Couldn't comment", String(e));
                } finally {
                  setSending(false);
                }
              }}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
