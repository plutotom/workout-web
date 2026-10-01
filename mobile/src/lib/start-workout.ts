import { router } from "expo-router";
import { Alert } from "react-native";

import { useLocalActiveWorkout, useLocalData } from "@/data/local/provider";

export function useStartWorkout() {
  const active = useLocalActiveWorkout();
  const { startBlank, startFromTemplate, startNote } = useLocalData();

  async function launch(
    templateId?: string,
    abandonExisting = false,
    placeId?: string | null,
    note = false,
  ) {
    const sessionId = note
      ? await startNote(abandonExisting, placeId)
      : templateId
        ? await startFromTemplate(templateId, abandonExisting, placeId)
        : await startBlank(abandonExisting, placeId);
    router.push({
      pathname: "/workout/[sessionId]",
      params: { sessionId },
    });
  }

  function begin(templateId?: string, placeId?: string | null, note = false) {
    if (active) {
      Alert.alert(
        "Workout already in progress",
        `Continue ${active.templateName ?? "your workout"}, or discard it and start a new one?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Continue",
            onPress: () =>
              router.push({
                pathname: "/workout/[sessionId]",
                params: { sessionId: String(active._id) },
              }),
          },
          {
            text: "Start new",
            style: "destructive",
            onPress: () =>
              void launch(templateId, true, placeId, note).catch(
                showStartError,
              ),
          },
        ],
      );
      return;
    }
    void launch(templateId, false, placeId, note).catch(showStartError);
  }

  return {
    active,
    begin,
    beginNote: (placeId?: string | null) => begin(undefined, placeId, true),
  };
}

function showStartError(error: unknown) {
  Alert.alert(
    "Couldn’t start workout",
    error instanceof Error ? error.message : "Please try again.",
  );
}
