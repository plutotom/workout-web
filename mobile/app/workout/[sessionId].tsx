import { useLocalSearchParams } from "expo-router";

import { WorkoutScreen } from "@/components/workout/workout-screen";

export default function WorkoutRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <WorkoutScreen sessionId={sessionId} />;
}
