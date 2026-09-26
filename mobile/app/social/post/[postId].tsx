import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { SocialPost } from "@/components/social-post";
import { Button, EmptyState, PageHeader, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function PostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const id = postId as Id<"activityPosts">;
  const post = useQuery(api.routes.social.queries.post, { postId: id });
  const comments = useQuery(api.routes.social.queries.comments, { postId: id });
  const me = useQuery(api.routes.social.queries.me);
  const add = useMutation(api.routes.social.mutations.addComment);
  const remove = useMutation(api.routes.social.mutations.removeComment);
  const removePost = useMutation(api.routes.social.mutations.removePost);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
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
      {post === null ? (
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
          {comments?.map((c) => (
            <Pressable
              key={c.id}
              onLongPress={() => {
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
              disabled={!message.trim() || sending}
              onPress={async () => {
                setSending(true);
                try {
                  await add({ postId: id, text: message });
                  setMessage("");
                } catch (e) {
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
