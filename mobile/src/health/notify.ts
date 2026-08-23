import * as Notifications from "expo-notifications";

import { autoImportNotificationCopy } from "@/health/auto-import";
import type { HealthWorkoutSummary } from "@/health/types";

let handlerInstalled = false;

function ensureNotificationHandler() {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestAutoImportNotificationPermission() {
  try {
    ensureNotificationHandler();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}

export async function notifyAutoImportedWorkouts(
  workouts: Array<
    Pick<HealthWorkoutSummary, "activityName" | "durationSeconds">
  >,
) {
  if (workouts.length === 0) return;
  try {
    ensureNotificationHandler();
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
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
