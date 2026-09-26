import { api } from "@backend/api";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Text, TextInput } from "react-native";

import { Button, PageHeader, Screen } from "@/components/ui";
import { useMobileAuth } from "@/auth/auth-provider";
import { colors } from "@/theme";

export default function ShareWorkoutScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { isAuthenticated } = useMobileAuth();
  const remoteId = useQuery(
    api.routes.social.queries.syncedSession,
    isAuthenticated ? { localId: sessionId } : "skip",
  );
  const shared = useQuery(
    api.routes.social.queries.sharedSession,
    remoteId ? { sessionId: remoteId } : "skip",
  );
  const share = useMutation(api.routes.social.mutations.shareWorkout);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  return (
    <Screen>
      <PageHeader
        back
        title="Share workout"
        subtitle="Your workout will appear on your profile and in your followers’ feeds."
      />
      {!isAuthenticated ? (
        <Button
          label="Sign in to share"
          onPress={() =>
            router.push({
              pathname: "/sign-in",
              params: { next: `/social/share/${sessionId}` },
            })
          }
        />
      ) : null}
      {isAuthenticated && remoteId === null ? (
        <Text style={{ color: colors.dim, marginBottom: 20 }}>
          Waiting for this workout to sync. Reopen this screen when you’re
          online.
        </Text>
      ) : null}
      {shared ? (
        <Button
          label="View shared workout"
          onPress={() =>
            router.replace({
              pathname: "/social/post/[postId]",
              params: { postId: shared },
            })
          }
        />
      ) : null}
      {remoteId && !shared ? (
        <>
          <TextInput
            accessibilityLabel="Workout caption"
            placeholder="How did it go? (optional)"
            placeholderTextColor={colors.dim}
            value={caption}
            onChangeText={setCaption}
            maxLength={500}
            multiline
            style={{
              color: colors.text,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: 12,
              minHeight: 100,
              padding: 14,
              marginBottom: 16,
            }}
          />
          <Button
            label={posting ? "Sharing…" : "Post workout"}
            disabled={posting || shared === undefined}
            onPress={async () => {
              setPosting(true);
              try {
                const postId = await share({ sessionId: remoteId, caption });
                router.replace({
                  pathname: "/social/post/[postId]",
                  params: { postId },
                });
              } catch (e) {
                Alert.alert(
                  "Couldn't share",
                  e instanceof Error ? e.message : "Try again.",
                );
              } finally {
                setPosting(false);
              }
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
