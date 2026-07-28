import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { History } from "lucide-react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { parseDays, SessionRows } from "@/components/insights";
import { EmptyState, PageHeader, Screen } from "@/components/ui";
import { useMergedInsightsSessions } from "@/data/local/use-local-insights";

export default function AllSessionsScreen() {
  const { isAuthenticated } = useMobileAuth();
  const { days: value } = useLocalSearchParams<{ days?: string }>();
  const days = parseDays(value);
  const remoteSessions = useQuery(
    api.routes.insights.queries.sessionHistory,
    isAuthenticated ? { days } : "skip",
  );
  const sessions = useMergedInsightsSessions(
    days,
    isAuthenticated ? remoteSessions : undefined,
  );
  return (
    <Screen>
      <PageHeader
        back
        title="All workouts"
        subtitle={days === null ? "All time" : `Last ${days} days`}
      />
      {sessions?.length ? (
        <SessionRows sessions={sessions} />
      ) : sessions ? (
        <EmptyState
          icon={History}
          title="No workouts in this period"
          description="Finished workouts will show up here."
        />
      ) : null}
    </Screen>
  );
}
