import { api } from "@backend/api";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { Bell, Search, UserRound } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
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
import { optimisticReadNotifications } from "@/lib/social-optimistic";
import { colors } from "@/theme";
import { openSocialPost } from "@/lib/social-navigation";

export default function SocialScreen() {
  const { isAuthenticated, accountStatus, retryAccountConnection } =
    useMobileAuth();
  const feed = useQuery(
    api.routes.social.queries.feed,
    isAuthenticated ? {} : "skip",
  );
  const me = useQuery(
    api.routes.social.queries.me,
    isAuthenticated ? {} : "skip",
  );
  const notifications = useQuery(
    api.routes.social.queries.notifications,
    isAuthenticated ? {} : "skip",
  );
  const markRead = useMutation(
    api.routes.social.mutations.markNotificationsRead,
  ).withOptimisticUpdate(optimisticReadNotifications);
  const [open, setOpen] = useState(false);

  if (
    accountStatus === "connecting" ||
    (isAuthenticated && (feed === undefined || me === undefined))
  ) {
    return <FullScreenLoader label="Loading social…" />;
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Your people"
        title="Social"
        action={
          isAuthenticated ? (
            <View style={{ flexDirection: "row", gap: 18 }}>
              <Pressable
                accessibilityLabel="Find athletes"
                onPress={() => router.push("/social/people")}
              >
                <Search color={colors.text} size={23} />
              </Pressable>
              <Pressable
                accessibilityLabel="My profile"
                onPress={() =>
                  me &&
                  router.push({
                    pathname: "/social/profile/[userId]",
                    params: { userId: me.id },
                  })
                }
              >
                <UserRound color={colors.text} size={23} />
              </Pressable>
              <Pressable
                accessibilityLabel="Notifications"
                onPress={() => {
                  setOpen(true);
                  void markRead().catch((error) => {
                    console.warn(
                      "[social] couldn't mark notifications read",
                      error,
                    );
                  });
                }}
              >
                <Bell color={colors.text} size={23} />
                {notifications?.some((n) => !n.read) ? (
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: colors.action,
                      position: "absolute",
                      right: 0,
                      top: 0,
                    }}
                  />
                ) : null}
              </Pressable>
            </View>
          ) : undefined
        }
      />
      {accountStatus === "error" ? (
        <EmptyState
          title="Account unavailable"
          description="Couldn't connect your account. Try again when you're online."
          action={
            <Button
              label="Reconnect"
              onPress={() =>
                void retryAccountConnection().catch(() =>
                  Alert.alert(
                    "Couldn't reconnect",
                    "Please try again when you're online.",
                  ),
                )
              }
            />
          }
        />
      ) : !isAuthenticated ? (
        <EmptyState
          title="Train with others"
          description="Sign in to follow athletes, share workouts, and save their routines."
          action={
            <Button
              label="Sign in"
              onPress={() =>
                router.push({
                  pathname: "/sign-in",
                  params: { next: "/social" },
                })
              }
            />
          }
        />
      ) : null}
      {isAuthenticated && feed?.length === 0 ? (
        <EmptyState
          title="Your feed starts here"
          description="Find athletes to follow or share a completed workout from its recap."
          action={
            <Button
              label="Find athletes"
              onPress={() => router.push("/social/people")}
            />
          }
        />
      ) : null}
      {feed?.map((post) => (
        <SocialPost key={post.id} post={post} />
      ))}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <Screen>
          <PageHeader
            title="Notifications"
            action={
              <Button
                label="Done"
                variant="ghost"
                size="sm"
                onPress={() => setOpen(false)}
              />
            }
          />
          {notifications === undefined ? (
            <ActivityIndicator
              color={colors.text}
              accessibilityLabel="Loading notifications"
            />
          ) : null}
          {notifications?.length === 0 ? (
            <Text style={{ color: colors.dim }}>
              Follows, yee haws, and comments will appear here.
            </Text>
          ) : null}
          {notifications?.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => {
                setOpen(false);
                if (n.postId && n.kind !== "follow") openSocialPost(n.postId);
                else
                  router.push({
                    pathname: "/social/profile/[userId]",
                    params: { userId: n.actorId },
                  });
              }}
              style={{
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontWeight: n.read ? "400" : "700",
                }}
              >
                {n.name}{" "}
                {n.kind === "follow"
                  ? "followed you"
                  : n.kind === "like"
                    ? "yee hawed your workout"
                    : "commented on your workout"}
              </Text>
              <Text style={{ color: colors.dim, marginTop: 4 }}>
                {new Date(n.createdAt).toLocaleDateString()}
              </Text>
            </Pressable>
          ))}
        </Screen>
      </Modal>
    </Screen>
  );
}
