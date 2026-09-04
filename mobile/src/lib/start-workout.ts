import { router } from "expo-router";
import { Alert } from "react-native";

import { useLocalActiveWorkout, useLocalData } from "@/data/local/provider";

export function useStartWorkout() {
  const active = useLocalActiveWorkout();
  const { startBlank, startFromTemplate } = useLocalData();

  async function launch(
    templateId?: string,
    abandonExisting = false,
    placeId?: string | null,
  ) {
    const sessionId = templateId
      ? await startFromTemplate(templateId, abandonExisting, placeId)
      : await startBlank(abandonExisting, placeId);
    router.push({
      pathname: "/workout/[sessionId]",
      params: { sessionId },
    });
  }

  function begin(templateId?: string, placeId?: string | null) {
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
              void launch(templateId, true, placeId).catch(showStartError),
          },
        ],
      );
      return;
    }
    void launch(templateId, false, placeId).catch(showStartError);
  }

  return { active, begin };
}

function showStartError(error: unknown) {
  Alert.alert(
    "Couldn’t start workout",
    error instanceof Error ? error.message : "Please try again.",
  );
}
