import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";

import { hasNotificationPermission } from "@/lib/notifications";

type Rest = { endsAt: number; seconds: number; label: string };

export function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function useRestTimer(options?: { notificationsEnabled?: boolean }) {
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(0);
  const notificationId = useRef<string | null>(null);
  const notificationsEnabled = options?.notificationsEnabled ?? true;
  const remaining = rest
    ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000))
    : 0;

  useEffect(() => {
    if (!rest) return;
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= rest.endsAt) {
        setRest(null);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
    }, 250);
    return () => clearInterval(interval);
  }, [rest]);

  useEffect(() => {
    if (notificationsEnabled || !notificationId.current) return;
    void Notifications.cancelScheduledNotificationAsync(
      notificationId.current,
    ).catch(() => undefined);
    notificationId.current = null;
  }, [notificationsEnabled]);

  const clear = useCallback(async () => {
    setRest(null);
    if (notificationId.current) {
      await Notifications.cancelScheduledNotificationAsync(
        notificationId.current,
      ).catch(() => undefined);
      notificationId.current = null;
    }
  }, []);

  const start = useCallback(
    async (seconds: number, label: string) => {
      await clear();
      const startedAt = Date.now();
      setNow(startedAt);
      setRest({ endsAt: startedAt + seconds * 1000, seconds, label });
      if (
        Platform.OS === "ios" &&
        notificationsEnabled &&
        (await hasNotificationPermission())
      ) {
        notificationId.current = await Notifications.scheduleNotificationAsync({
          content: { title: "Rest complete", body: label, sound: "default" },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds,
          },
        }).catch(() => null);
      }
    },
    [clear, notificationsEnabled],
  );

  const add = useCallback((seconds: number) => {
    setRest((current) =>
      current
        ? {
            ...current,
            seconds: current.seconds + seconds,
            endsAt: current.endsAt + seconds * 1000,
          }
        : current,
    );
  }, []);

  return { rest, remaining, start, clear, add };
}
