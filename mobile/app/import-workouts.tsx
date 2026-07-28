import { api } from "@backend/api";
import { useMutation } from "convex/react";
import { router } from "expo-router";
import { Check, ClipboardPaste, FileUp, Upload } from "lucide-react-native";
import { useState } from "react";
import { Alert, Text } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { BundlePreview } from "@/components/bundle-preview";
import { Button, Field, PageHeader, Screen } from "@/components/ui";
import {
  pasteBundleFromClipboard,
  pickBundleFile,
} from "@/lib/workout-transfer";
import { colors } from "@/theme";
import { parseBundle, type WorkoutExportBundle } from "@shared/workout-export";

/**
 * Import from a file, the clipboard, or a typed code.
 *
 * Everything except the final write works offline — the bundle is
 * self-contained, so parsing and previewing never touch the network.
 */
export default function ImportWorkoutsScreen() {
  const { isAuthenticated } = useMobileAuth();
  const importBundle = useMutation(api.routes.templates.mutations.importBundle);

  const [text, setText] = useState("");
  const [bundle, setBundle] = useState<WorkoutExportBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function apply(
    result:
      | { ok: true; bundle: WorkoutExportBundle }
      | { ok: false; error: string },
  ) {
    if (result.ok) {
      setBundle(result.bundle);
      setError(null);
      return;
    }
    setBundle(null);
    setError(result.error);
  }

  async function handlePickFile() {
    const result = await pickBundleFile();
    if (!result) return;
    setText("");
    apply(result);
  }

  async function handlePaste() {
    const result = await pasteBundleFromClipboard();
    if (result.ok) setText("");
    apply(result);
  }

  function handleTextChange(next: string) {
    setText(next);
    if (!next.trim()) {
      setBundle(null);
      setError(null);
      return;
    }
    apply(parseBundle(next));
  }

  async function handleImport() {
    if (!bundle) return;
    setImporting(true);
    try {
      const result = await importBundle({ bundle });
      Alert.alert(
        "Imported",
        result.templatesImported === 1
          ? `Added "${result.names[0]}" to your templates.`
          : `Added ${result.templatesImported} templates.`,
      );
      router.replace("/(tabs)/templates");
    } catch (caught) {
      Alert.alert(
        "Couldn't import",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <Screen>
      <PageHeader
        back
        title="Import workouts"
        subtitle="From a .json file, the clipboard, or a pasted code."
      />

      <Button
        label="Choose a file"
        variant="outline"
        icon={FileUp}
        onPress={handlePickFile}
      />
      <Button
        label="Paste from clipboard"
        variant="outline"
        icon={ClipboardPaste}
        onPress={handlePaste}
      />

      <Field
        label="Or paste a share code"
        value={text}
        onChangeText={handleTextChange}
        placeholder="WKT1-…"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />

      {error ? (
        <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
      ) : null}

      {bundle ? (
        <>
          <BundlePreview bundle={bundle} />
          <Text style={{ color: colors.dim, fontSize: 11 }}>
            {isAuthenticated
              ? "These are added as new templates — nothing you already have is changed or replaced."
              : "You can read this export offline, but saving it needs a connection. Sign in and reconnect to finish importing."}
          </Text>
          <Button
            label={importing ? "Importing…" : "Import"}
            icon={importing ? Check : Upload}
            disabled={importing || !isAuthenticated}
            onPress={handleImport}
          />
        </>
      ) : null}
    </Screen>
  );
}
