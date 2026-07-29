import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Check, Link2Off, Upload } from "lucide-react-native";
import { useState } from "react";
import { Alert, Text } from "react-native";

import { BundlePreview } from "@/components/bundle-preview";
import {
  Button,
  EmptyState,
  FullScreenLoader,
  PageHeader,
  Screen,
} from "@/components/ui";
import { useLocalData } from "@/data/local/provider";
import { colors } from "@/theme";
import {
  validateBundle,
  type WorkoutExportBundle,
} from "@shared/workout-export";

/**
 * Deep-link target for a shared workout.
 *
 * Reached from a universal link (`https://workout.plutotom.com/share/<token>`,
 * claimed via `associatedDomains` in app.json) or the `workout://share/<token>`
 * scheme. Expo Router matches the path, so no manual link parsing is needed.
 *
 * Fetching the preview needs a connection (the snapshot lives on the server).
 * Saving does not — the bundle is written to local SQLite and syncs later.
 */
export default function SharedWorkoutScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { importBundle } = useLocalData();
  const share = useQuery(api.routes.shares.queries.preview, { token });

  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleImport(bundle: WorkoutExportBundle) {
    setImporting(true);
    try {
      const result = await importBundle(bundle);
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
      <Button
        label={
          done ? "Imported" : importing ? "Importing…" : "Add to my templates"
        }
        icon={done ? Check : Upload}
        disabled={importing || done}
        onPress={() => handleImport(parsed.bundle)}
      />
      <Text style={{ color: colors.dim, fontSize: 11, textAlign: "center" }}>
        Added as new templates — nothing you already have is changed. Works
        without signing in; syncs when you reconnect.
      </Text>
    </Screen>
  );
}
