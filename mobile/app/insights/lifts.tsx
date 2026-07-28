import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Dumbbell } from "lucide-react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { LiftRows, parseDays } from "@/components/insights";
import { EmptyState, PageHeader, Screen } from "@/components/ui";
import { useLocalInsightsLifts } from "@/data/local/use-local-insights";

export default function AllLiftsScreen() {
  const { isAuthenticated } = useMobileAuth();
  const { days: value } = useLocalSearchParams<{ days?: string }>();
  const days = parseDays(value);
  const remoteLifts = useQuery(
    api.routes.insights.queries.lifts,
    isAuthenticated ? { days } : "skip",
  );
  const localLifts = useLocalInsightsLifts(days);
  const lifts = isAuthenticated ? remoteLifts : localLifts;
  return (
    <Screen>
      <PageHeader
        back
        title="All lifts"
        subtitle={days === null ? "All time" : `Last ${days} days`}
      />
      {lifts?.length ? (
        <LiftRows lifts={lifts} days={days} />
      ) : lifts ? (
        <EmptyState
          icon={Dumbbell}
          title="No lifts in this period"
          description="Complete weighted sets to see lift rankings here."
        />
      ) : null}
    </Screen>
  );
}
