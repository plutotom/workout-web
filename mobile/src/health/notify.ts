import * as Notifications from "expo-notifications";

import { autoImportNotificationCopy } from "@/health/auto-import";
import { hasNotificationPermission } from "@/lib/notifications";
import type { HealthWorkoutSummary } from "@/health/types";

export async function notifyAutoImportedWorkouts(
  workouts: Array<
    Pick<HealthWorkoutSummary, "activityName" | "durationSeconds">
  >,
) {
  if (workouts.length === 0) return;
  try {
    if (!(await hasNotificationPermission())) return;
    const copy = autoImportNotificationCopy(workouts);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        sound: "default",
      },
      trigger: null,
    });
  } catch {
    // Local notifications are best-effort. Import already succeeded.
  }
}
