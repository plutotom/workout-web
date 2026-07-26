import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Dumbbell } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import {
  Card,
  EmptyState,
  FullScreenLoader,
  PageHeader,
  Screen,
  SectionTitle,
  Segmented,
} from "@/components/ui";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";

type Tab = "history" | "records";
const tabs = [
  { value: "history", label: "History" },
  { value: "records", label: "Records" },
] as const;

export default function ExerciseInsightsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const catalog = useCatalog();
  const [tab, setTab] = useState<Tab>("history");
  const history = useQuery(api.routes.insights.queries.exerciseHistory, {
    slug,
    days: null,
  });
  const records = useQuery(api.routes.insights.queries.exerciseRecords, {
    slug,
  });

  if (history === undefined || records === undefined)
    return <FullScreenLoader label="Loading exercise…" />;
  const hasData = history.sessions.length > 0 || records.est1RM > 0;
  return (
    <Screen>
      <PageHeader back title={catalog.name(slug)} />
      {!hasData ? (
        <EmptyState
          icon={Dumbbell}
          title="No data for this exercise"
          description="Log weight and reps during a workout to see history and records here."
        />
      ) : (
        <>
          <Card>
            <Text
              style={{
                color: colors.dim,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 2,
              }}
            >
              EXERCISE
            </Text>
            <Text
              style={{ color: colors.text, fontSize: 32, fontWeight: "700" }}
            >
              {records.est1RM} lb
            </Text>
            <Text style={{ color: colors.dim, fontSize: 12 }}>
              Estimated 1RM · {history.sessions.length} logged session
              {history.sessions.length === 1 ? "" : "s"}
            </Text>
          </Card>
          <Segmented value={tab} options={tabs} onChange={setTab} />
          {tab === "history" ? (
            <HistoryList sessions={history.sessions} />
          ) : (
            <Records records={records} />
          )}
        </>
      )}
    </Screen>
  );
}

function HistoryList({
  sessions,
}: {
  sessions: {
    sessionId: string;
    templateName: string;
    completedAt: number;
    bestEst1RM: number;
    sets: { weight: number; reps: number }[];
  }[];
}) {
  if (!sessions.length)
    return (
      <Text style={{ color: colors.dim }}>
        No logged sets for this exercise yet.
      </Text>
    );
  return (
    <View style={{ gap: 10 }}>
      {sessions.map((session) => (
        <Card key={session.sessionId}>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {session.templateName}
              </Text>
              <Text style={{ color: colors.dim, fontSize: 11, marginTop: 3 }}>
                {new Date(session.completedAt).toLocaleString()}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontWeight: "700" }}>
              1RM {session.bestEst1RM}
            </Text>
          </View>
          {session.sets.map((set, index) => (
            <View
              key={index}
              style={{
                flexDirection: "row",
                paddingTop: 8,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
              }}
            >
              <Text style={{ color: colors.dim, width: 34 }}>#{index + 1}</Text>
              <Text style={{ color: colors.text, flex: 1 }}>
                {set.weight} lb × {set.reps}
              </Text>
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

function Records({
  records,
}: {
  records: {
    est1RM: number;
    bestWeight: number;
    bestReps: number;
    maxVolume: number;
    repLadder: {
      reps: number;
      bestWeight: number | null;
      bestReps: number | null;
      bestDate: number | null;
      predicted: number;
    }[];
  };
}) {
  return (
    <View style={{ gap: 16 }}>
      <SectionTitle title="Personal records" />
      <Card>
        <RecordRow label="1RM" value={`${records.est1RM} lb`} />
        <RecordRow
          label="Best weight"
          value={`${records.bestWeight} lb × ${records.bestReps}`}
        />
        <RecordRow
          label="Max volume"
          value={`${new Intl.NumberFormat().format(records.maxVolume)} lb`}
        />
      </Card>
      <SectionTitle title="Rep ladder" />
      <Card style={{ gap: 0 }}>
        {records.repLadder.map((entry) => (
          <View
            key={entry.reps}
            style={{
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              borderTopWidth: entry.reps === 1 ? 0 : 1,
              borderTopColor: colors.line,
            }}
          >
            <Text style={{ color: colors.dim, width: 48 }}>
              {entry.reps} rep
            </Text>
            <Text style={{ color: colors.text, flex: 1 }}>
              {entry.bestWeight == null
                ? "—"
                : `${entry.bestWeight} lb (×${entry.bestReps})`}
            </Text>
            <Text style={{ color: colors.dim }}>{entry.predicted} lb</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

function RecordRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}
    >
      <Text style={{ color: colors.dim }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}
