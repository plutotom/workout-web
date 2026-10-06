import { api } from "@backend/api";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";

import { Button, Card, PageHeader, Screen } from "@/components/ui";
import { useMobileAuth } from "@/auth/auth-provider";
import { useLocalWorkout } from "@/data/local/provider";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";
import { leaveSocialPost, showPublishedPost } from "@/lib/social-navigation";
import { measureMobileAsync } from "@/lib/performance-timing";
import { useCommitTiming } from "@/lib/use-performance-timing";

export default function ShareWorkoutScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { isAuthenticated } = useMobileAuth();
  const share = useMutation(api.routes.social.mutations.shareWorkout);
  const { isWebSocketConnected } = useConvexConnectionState();
  const localWorkout = useLocalWorkout(sessionId);
  const catalog = useCatalog();
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const remoteId = useQuery(
    api.routes.social.queries.syncedSession,
    isAuthenticated ? { localId: sessionId } : "skip",
  );
  const shared = useQuery(
    api.routes.social.queries.sharedSession,
    remoteId ? { sessionId: remoteId } : "skip",
  );
  // Web-logged workouts may not exist in SQLite. Fetch their preview only on a local miss.
  const remoteWorkout = useQuery(
    api.routes.workouts.queries.get,
    localWorkout === null && isAuthenticated && remoteId
      ? { sessionId: remoteId }
      : "skip",
  );
  const workout = localWorkout ?? remoteWorkout;
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    exercises: { id: string; name: string; sets: number }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const measureShareCommit = useCommitTiming("social.share.ui_commit");
  return (
    <Screen>
      <PageHeader
        back
        onBack={() => leaveSocialPost()}
        title={posting ? "Sharing workout" : "Share workout"}
        subtitle={
          posting
            ? "Your post will open when it’s ready."
            : "Your workout will appear on your profile and in your followers’ feeds."
        }
      />
      {!posting &&
      isAuthenticated &&
      (remoteId === undefined || (remoteId && shared === undefined)) ? (
        <ActivityIndicator
          accessibilityLabel="Preparing to share"
          color={colors.text}
        />
      ) : null}
      {!posting && !isAuthenticated ? (
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
      {!posting && isAuthenticated && remoteId === null ? (
        <Text style={{ color: colors.dim, marginBottom: 20 }}>
          Waiting for this workout to sync. Reopen this screen when you’re
          online.
        </Text>
      ) : null}
      {shared && !posting ? (
        <Button
          label="View shared workout"
          onPress={() => showPublishedPost(shared)}
        />
      ) : null}
      {posting || (remoteId && !shared) ? (
        <>
          {posting ? (
            <Card style={{ gap: 12, marginBottom: 16 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <ActivityIndicator
                  accessibilityLabel="Publishing workout"
                  color={colors.text}
                />
                <Text
                  accessibilityLiveRegion="polite"
                  style={{ color: colors.dim }}
                >
                  {isWebSocketConnected
                    ? "Sharing…"
                    : "Waiting for connection…"}
                </Text>
              </View>
              <Text
                style={{ color: colors.text, fontWeight: "700", fontSize: 20 }}
              >
                {preview?.title || "Workout"}
              </Text>
              {caption.trim() ? (
                <Text style={{ color: colors.text }}>{caption.trim()}</Text>
              ) : null}
              {preview ? (
                <>
                  <Text style={{ color: colors.dim }}>
                    {preview.exercises.length} exercises
                  </Text>
                  {preview.exercises.map((exercise) => (
                    <Text key={exercise.id} style={{ color: colors.dim }}>
                      {exercise.name} · {exercise.sets} sets
                    </Text>
                  ))}
                </>
              ) : null}
            </Card>
          ) : (
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
          )}
          {error && !posting ? (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.danger, marginBottom: 16 }}
            >
              {error}
            </Text>
          ) : null}
          <Button
            label={posting ? "Sharing…" : "Post workout"}
            disabled={posting || shared === undefined}
            onPress={async () => {
              if (!remoteId || inFlight.current || shared !== null) return;
              inFlight.current = true;
              measureShareCommit();
              setError(null);
              setPreview(
                workout
                  ? {
                      title: workout.templateName || "Workout",
                      exercises: workout.exercises.map((exercise) => ({
                        id: exercise._id,
                        name: catalog.name(exercise.slug),
                        sets: exercise.sets.filter((set) => set.completed)
                          .length,
                      })),
                    }
                  : null,
              );
              setPosting(true);
              try {
                const postId = await measureMobileAsync(
                  "social.share.confirmation",
                  () =>
                    share({
                      sessionId: remoteId,
                      caption,
                    }),
                );
                // A slow request must not pull the user back after they leave.
                if (focused.current) {
                  showPublishedPost(postId);
                }
              } catch (e) {
                const message = e instanceof Error ? e.message : "Try again.";
                setError(message);
                if (focused.current) Alert.alert("Couldn't share", message);
              } finally {
                inFlight.current = false;
                setPosting(false);
              }
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
