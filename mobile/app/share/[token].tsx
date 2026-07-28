import { api } from "@backend/api";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Check, Link2Off, LogIn, Upload } from "lucide-react-native";
import { useState } from "react";
import { Alert, Text } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { BundlePreview } from "@/components/bundle-preview";
import {
  Button,
  EmptyState,
  FullScreenLoader,
  PageHeader,
  Screen,
} from "@/components/ui";
import { colors } from "@/theme";
import { validateBundle } from "@shared/workout-export";

/**
 * Deep-link target for a shared workout.
 *
 * Reached from a universal link (`https://workout.plutotom.com/share/<token>`,
 * claimed via `associatedDomains` in app.json) or the `workout://share/<token>`
 * scheme. Expo Router matches the path, so no manual link parsing is needed.
 */
export default function SharedWorkoutScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  // A share link can land here with no session at all — the preview query is
  // public, so the workout is still shown and sign-in is only asked for at the
  // point of importing.
  const { loading: authLoading, isAuthenticated } = useMobileAuth();
  const share = useQuery(api.routes.shares.queries.preview, { token });
  const importFromToken = useMutation(
    api.routes.shares.mutations.importFromToken,
  );

  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleImport() {
    setImporting(true);
    try {
      const result = await importFromToken({ token });
      setDone(true);
      Alert.alert(
        "Imported",
        result.templatesImported === 1
          ? `Added "${result.names[0]}" to your templates.`
          : `Added ${result.templatesImported} templates.`,
      );
      router.replace("/(tabs)/templates");
    } catch (error) {
      Alert.alert(
        "Couldn't import",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setImporting(false);
    }
  }

  if (share === undefined) return <FullScreenLoader label="Opening share…" />;

  if (share === null) {
    return (
      <Screen>
        <PageHeader back title="Shared workouts" />
        <EmptyState
          icon={Link2Off}
          title="This link isn't available"
          description="Share links expire after 30 days and can be revoked by whoever created them. Ask for a fresh link, or import a file instead."
          action={
            <Button
              label="Import a file or code"
              variant="outline"
              onPress={() => router.replace("/import-workouts")}
            />
          }
        />
      </Screen>
    );
  }

  const parsed = validateBundle(share.bundle);
  if (!parsed.ok) {
    return (
      <Screen>
        <PageHeader back title="Shared workouts" />
        <Text style={{ fontSize: 13 }}>
          This share link is malformed and can&apos;t be imported.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        back
        eyebrow="Shared with you"
        title={
          share.sharedBy
            ? `${share.sharedBy} sent you a workout`
            : "Someone sent you a workout"
        }
      />
      <BundlePreview bundle={parsed.bundle} />
      {authLoading ? (
        <Button label="Checking your account…" disabled />
      ) : isAuthenticated ? (
        <>
          <Button
            label={
              done
                ? "Imported"
                : importing
                  ? "Importing…"
                  : "Add to my templates"
            }
            icon={done ? Check : Upload}
            disabled={importing || done}
            onPress={handleImport}
          />
          <Text
            style={{ color: colors.dim, fontSize: 11, textAlign: "center" }}
          >
            Added as new templates — nothing you already have is changed.
          </Text>
        </>
      ) : (
        <>
          <Button
            label="Sign in to import"
            icon={LogIn}
            onPress={() =>
              router.push({
                pathname: "/(auth)/sign-in",
                params: { next: `/share/${token}` },
              })
            }
          />
          <Text
            style={{ color: colors.dim, fontSize: 11, textAlign: "center" }}
          >
            You&apos;ll come straight back here after signing in.
          </Text>
        </>
      )}
    </Screen>
  );
}
