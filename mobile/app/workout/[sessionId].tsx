import type { Id } from "@backend/dataModel";
import { useLocalSearchParams } from "expo-router";

import {
  WorkoutFinishController,
  WorkoutScreen,
} from "@/components/workout/workout-screen";

export default function WorkoutRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <>
      <WorkoutFinishController />
      <WorkoutScreen sessionId={sessionId as Id<"workoutSessions">} />
    </>
  );
}
