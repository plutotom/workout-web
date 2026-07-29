import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { History } from "lucide-react-native";
import { useState } from "react";

import { useMobileAuth } from "@/auth/auth-provider";
import { parseDays, SessionRows } from "@/components/insights";
import { Button, EmptyState, PageHeader, Screen } from "@/components/ui";
import { useMergedInsightsSessions } from "@/data/local/use-local-insights";

/** Matches the web list's page size. */
const PAGE_SIZE = 20;

export default function AllSessionsScreen() {
  const { isAuthenticated } = useMobileAuth();
  const { days: value } = useLocalSearchParams<{ days?: string }>();
  const days = parseDays(value);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const remoteSessions = useQuery(
    api.routes.insights.queries.sessionHistory,
    isAuthenticated ? { days } : "skip",
  );
  const sessions = useMergedInsightsSessions(
    days,
    isAuthenticated ? remoteSessions : undefined,
  );
  const hasMore = (sessions?.length ?? 0) > visibleCount;
  return (
    <Screen>
      <PageHeader
        back
        title="All workouts"
        subtitle={days === null ? "All time" : `Last ${days} days`}
      />
      {sessions?.length ? (
        <>
          <SessionRows sessions={sessions.slice(0, visibleCount)} />
          {hasMore ? (
            <Button
              label="Load more"
              variant="outline"
              onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
            />
          ) : null}
        </>
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
