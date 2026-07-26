import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { Alert } from "react-native";

export function useStartWorkout() {
  const active = useQuery(api.routes.workouts.queries.active);
  const start = useMutation(api.routes.workouts.mutations.start);
  const startBlank = useMutation(api.routes.workouts.mutations.startBlank);

  async function launch(
    templateId?: Id<"workoutTemplates">,
    abandonExisting = false,
  ) {
    const sessionId = templateId
      ? await start({ templateId, abandonExisting })
      : await startBlank({ abandonExisting });
    router.push({
      pathname: "/workout/[sessionId]",
      params: { sessionId: String(sessionId) },
    });
  }

  function begin(templateId?: Id<"workoutTemplates">) {
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
            onPress: () => void launch(templateId, true),
          },
        ],
      );
      return;
    }
    void launch(templateId);
  }

  return { active, begin };
}
