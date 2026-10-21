import { api } from "@backend/api";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";

import { Button, Card, PageHeader, Screen } from "@/components/ui";
import { KeyboardStickyFooter } from "@/components/keyboard-sticky-footer";
import { useMobileAuth } from "@/auth/auth-provider";
import {
  useLocalData,
  useLocalSessionShareOutboxAttempt,
  useLocalWorkout,
} from "@/data/local/provider";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";
import { leaveSocialPost, showPublishedPost } from "@/lib/social-navigation";
import { measureMobileAsync } from "@/lib/performance-timing";
import { useCommitTiming } from "@/lib/use-performance-timing";
import {
  resolveShareSessionGate,
  SHARE_SYNC_FAILED_COPY,
  SHARE_SYNC_OFFLINE_COPY,
  SHARE_SYNC_PENDING_COPY,
  SHARE_SYNC_SLOW_COPY,
  SHARE_SYNC_WAIT_MS,
} from "@/lib/share-session-gate";

export default function ShareWorkoutScreen() {
  const params = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;
  const { isAuthenticated } = useMobileAuth();
  const { retrySessionSync } = useLocalData();
  const share = useMutation(api.routes.social.mutations.shareWorkout);
  const { isWebSocketConnected } = useConvexConnectionState();
  const localWorkout = useLocalWorkout(sessionId ?? "");
  const pendingAttemptCount = useLocalSessionShareOutboxAttempt(
    sessionId ?? "",
  );
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
    isAuthenticated && sessionId ? { localId: sessionId } : "skip",
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
  const [syncWait, setSyncWait] = useState({
    sessionId,
    attempt: 0,
    expired: false,
  });
  const waitingForSync = isAuthenticated && isWebSocketConnected && !remoteId;
  useEffect(() => {
    if (!waitingForSync) return;
    const timer = setTimeout(
      () => setSyncWait((value) => ({ ...value, expired: true })),
      SHARE_SYNC_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [waitingForSync, sessionId, syncWait.attempt]);
  // A different workout gets a fresh bounded wait rather than the last one's error.
  if (syncWait.sessionId !== sessionId) {
    setSyncWait({ sessionId, attempt: 0, expired: false });
  }
  const gate = resolveShareSessionGate({
    isAuthenticated,
    isWebSocketConnected,
    convexRemoteId: remoteId,
    localCompleted: localWorkout?.status === "completed",
    pendingAttemptCount,
    waitExpired: syncWait.sessionId === sessionId && syncWait.expired,
  });
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    exercises: { id: string; name: string; sets: number }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);
  const measureShareCommit = useCommitTiming("social.share.ui_commit");

  const retrySync = useCallback(async () => {
    if (!sessionId || retrying) return;
    setRetrying(true);
    setError(null);
    try {
      await retrySessionSync(sessionId);
      setSyncWait((value) => ({
        ...value,
        attempt: value.attempt + 1,
        expired: false,
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Try again.";
      setError(message);
    } finally {
      setRetrying(false);
    }
  }, [retrySessionSync, retrying, sessionId]);

  const shareForm = posting || (gate.kind === "ready" && !shared);
  const footer =
    shareForm || (gate.kind === "failed" && gate.canRetry) ? (
      <KeyboardStickyFooter
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          gap: 10,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.line,
        }}
      >
        {error && !posting ? (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.danger, marginBottom: 4 }}
          >
            {error}
          </Text>
        ) : null}
        {shareForm ? (
          <Button
            label={posting ? "Sharing…" : "Post workout"}
            disabled={posting || !remoteId || shared === undefined}
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
        ) : (
          <Button
            label={retrying ? "Retrying…" : "Retry sync"}
            disabled={retrying}
            onPress={() => void retrySync()}
          />
        )}
      </KeyboardStickyFooter>
    ) : undefined;

  return (
    <Screen footer={footer}>
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
      (gate.kind === "loading" ||
        (gate.kind === "ready" && shared === undefined)) ? (
        <ActivityIndicator
          accessibilityLabel="Preparing to share"
          color={colors.text}
        />
      ) : null}
      {!posting && gate.kind === "signed_out" ? (
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
      {!posting && gate.kind === "offline" ? (
        <Text style={{ color: colors.dim, marginBottom: 20 }}>
          {SHARE_SYNC_OFFLINE_COPY}
        </Text>
      ) : null}
      {!posting && gate.kind === "syncing" ? (
        <View style={{ gap: 12, marginBottom: 20 }}>
          <ActivityIndicator
            accessibilityLabel="Syncing workout"
            color={colors.text}
          />
          <Text style={{ color: colors.dim }}>{SHARE_SYNC_PENDING_COPY}</Text>
        </View>
      ) : null}
      {!posting && gate.kind === "failed" ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.dim, marginBottom: 20 }}
        >
          {syncWait.expired ? SHARE_SYNC_SLOW_COPY : SHARE_SYNC_FAILED_COPY}
        </Text>
      ) : null}
      {shared && !posting ? (
        <Button
          label="View shared workout"
          onPress={() => showPublishedPost(shared)}
        />
      ) : null}
      {shareForm ? (
        posting ? (
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
                {isWebSocketConnected ? "Sharing…" : "Waiting for connection…"}
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
            scrollEnabled={false}
            style={{
              color: colors.text,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: 12,
              minHeight: 100,
              padding: 14,
              marginBottom: 16,
              fontSize: 16,
              textAlignVertical: "top",
            }}
          />
        )
      ) : null}
    </Screen>
  );
}
