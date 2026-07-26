import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Dumbbell } from "lucide-react-native";

import { LiftRows, parseDays } from "@/components/insights";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function AllLiftsScreen() {
  const { days: value } = useLocalSearchParams<{ days?: string }>();
  const days = parseDays(value);
  const lifts = useQuery(api.routes.insights.queries.lifts, { days });
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
