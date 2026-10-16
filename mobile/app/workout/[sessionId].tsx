import { useLocalSearchParams } from "expo-router";

import { WorkoutScreen } from "@/components/workout/workout-screen";

export default function WorkoutRoute() {
  const { sessionId, edit } = useLocalSearchParams<{
    sessionId: string;
    edit?: string;
  }>();
  return <WorkoutScreen sessionId={sessionId} startInEdit={edit === "1"} />;
}
