import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";

type Rest = { endsAt: number; seconds: number; label: string };

export function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function useRestTimer() {
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(0);
  const notificationId = useRef<string | null>(null);
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
      const permission = await Notifications.getPermissionsAsync().catch(
        () => null,
      );
      if (permission?.granted) {
        notificationId.current = await Notifications.scheduleNotificationAsync({
          content: { title: "Rest complete", body: label, sound: "default" },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds,
          },
        }).catch(() => null);
      }
    },
    [clear],
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
