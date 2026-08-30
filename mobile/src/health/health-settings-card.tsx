import { router } from "expo-router";
import { HeartPulse } from "lucide-react-native";
import { Platform, Text } from "react-native";
import { useEffect, useState } from "react";

import { Button, Card, SectionTitle } from "@/components/ui";
import { useHealthImportLookups } from "@/data/local/provider";
import { getHealthAdapter } from "@/health";
import { isStrengthActivityType } from "@/health/mapping";
import { findLikelyHealthOverlap } from "@/health/overlap";
import { colors } from "@/theme";

export function HealthSettingsCard() {
  const lookups = useHealthImportLookups();
  const [available, setAvailable] = useState<boolean | null>(
    Platform.OS === "ios" ? null : false,
  );
  const [overlapReview, setOverlapReview] = useState(false);

  useEffect(() => {
    let active = true;
    void getHealthAdapter()
      .isAvailable()
      .then((value) => {
        if (active) setAvailable(value);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!lookups?.authRequested) return;
    let cancelled = false;
    void (async () => {
      try {
        const adapter = getHealthAdapter();
        if (!(await adapter.isAvailable())) return;
        const workouts = await adapter.queryRecentWorkouts({
          since: Date.now() - 90 * 24 * 60 * 60 * 1000,
        });
        if (cancelled) return;
        const review = workouts.some((workout) => {
          if (lookups.imported.has(workout.uuid)) return false;
          if (lookups.ignored.has(workout.uuid)) return false;
          if (!isStrengthActivityType(workout.activityType)) return false;
          return Boolean(
            findLikelyHealthOverlap(
              {
                startedAt: workout.startedAt,
                completedAt: workout.endedAt,
              },
              lookups.overlapCandidates,
            ),
          );
        });
        setOverlapReview(review);
      } catch {
        if (!cancelled) setOverlapReview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lookups]);

  const needsReview = lookups?.authRequested === true && overlapReview;
  const statusLabel =
    available === false
      ? "Health unavailable on this device"
      : needsReview
        ? "Needs review"
        : lookups?.authRequested
          ? "Connected"
          : "Available to connect";

  return (
    <Card>
      <HeartPulse color={colors.text} size={22} strokeWidth={2.3} />
      <SectionTitle title="Apple Health" />
      <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
        Import a run, ride, swim, triathlon, or other activity from Health. You
        can save workouts you finish here, and automatically import matching
        types.
      </Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
        {available === null ? "Checking…" : statusLabel}
      </Text>
      <Button
        label="Open Apple Health"
        variant="outline"
        icon={HeartPulse}
        onPress={() => router.push("/settings/health")}
      />
    </Card>
  );
}
