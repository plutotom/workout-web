import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button, Card, SectionTitle } from "@/components/ui";
import { useDataRecovery, useLocalData } from "@/data/local/provider";
import { useCatalog } from "@/providers/catalog-provider";
import { shareBackupFile } from "@/lib/workout-transfer";
import { colors } from "@/theme";

export function DataRecoveryCard() {
  const recovery = useDataRecovery();
  const { restoreNoteVersion, legacyBackup } = useLocalData();
  const catalog = useCatalog();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!recovery || (!recovery.legacyAvailable && !recovery.alternatives.length))
    return null;

  async function saveOlderData() {
    setBusy(true);
    try {
      const result = await shareBackupFile(await legacyBackup());
      if (!result.shared && result.reason)
        Alert.alert("Couldn’t save older data", result.reason);
    } catch (error) {
      Alert.alert(
        "Couldn’t save older data",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle title="Data recovery" />
      {recovery.legacyAvailable ? (
        <>
          <Text style={{ color: colors.dim, lineHeight: 20 }}>
            A copy of older workouts is still saved on this phone. Workouts
            whose account couldn’t be confirmed haven’t been uploaded. Save a
            recovery file, then restore it only into the account those workouts
            belong to.
          </Text>
          <Button
            label={busy ? "Preparing…" : "Save older data for recovery"}
            variant="outline"
            disabled={busy}
            onPress={() => void saveOlderData()}
          />
        </>
      ) : null}
      {recovery.alternatives.length ? (
        <>
          <Text style={{ color: colors.dim, lineHeight: 20 }}>
            Your phone’s note was kept when it differed from the cloud. Other
            versions are saved here and included in backups.
          </Text>
          <Button
            label={
              expanded
                ? "Hide saved note versions"
                : `Review saved note versions (${recovery.alternatives.length})`
            }
            variant="ghost"
            onPress={() => setExpanded((value) => !value)}
          />
          {expanded
            ? recovery.alternatives.map((version, index) => (
                <View key={`${version.slug}:${index}`} style={{ gap: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "600" }}>
                    {catalog.name(version.slug)}
                  </Text>
                  <Text
                    selectable
                    style={{ color: colors.dim, lineHeight: 20 }}
                  >
                    {version.notes || "Empty note"}
                  </Text>
                  <Button
                    label="Use this version"
                    variant="outline"
                    disabled={busy}
                    onPress={() => {
                      setBusy(true);
                      void restoreNoteVersion(version)
                        .catch((error) =>
                          Alert.alert(
                            "Couldn’t restore note",
                            error instanceof Error
                              ? error.message
                              : "Please try again.",
                          ),
                        )
                        .finally(() => setBusy(false));
                    }}
                  />
                </View>
              ))
            : null}
        </>
      ) : null}
    </Card>
  );
}
