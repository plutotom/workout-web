import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { BarChart3, MoreHorizontal } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { muscleGroupLabel } from "@shared/exercise-browser";

import { useMobileAuth } from "@/auth/auth-provider";
import {
  CustomExerciseEditor,
  type EditableCustomExercise,
} from "@/components/custom-exercise-editor";
import {
  Button,
  Card,
  FullScreenLoader,
  PageHeader,
  Screen,
  SectionTitle,
  Segmented,
} from "@/components/ui";
import {
  useLocalCustomExercises,
  useLocalData,
  useLocalExerciseNotes,
  useLocalTemplates,
} from "@/data/local/provider";
import {
  useMergedExerciseHistory,
  useMergedExerciseRecords,
} from "@/data/local/use-local-insights";
import { useCatalog } from "@/providers/catalog-provider";
import { colors, radius } from "@/theme";

type Tab = "summary" | "history" | "howto";
type ChartMetric = "weight" | "e1rm" | "volume";

const tabs = [
  { value: "summary" as const, label: "Summary" },
  { value: "history" as const, label: "History" },
  { value: "howto" as const, label: "How to" },
];

const chartMetrics = [
  { value: "weight" as const, label: "Heaviest" },
  { value: "e1rm" as const, label: "1RM" },
  { value: "volume" as const, label: "Volume" },
];

function sessionMetric(
  session: {
    bestEst1RM: number;
    sets: { weight: number; reps: number }[];
  },
  metric: ChartMetric,
) {
  if (metric === "e1rm") return session.bestEst1RM;
  if (metric === "weight") {
    return session.sets.reduce((max, set) => Math.max(max, set.weight), 0);
  }
  return session.sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
}

export default function ExerciseDetailScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(slugParam)
    ? (slugParam[0] ?? "")
    : (slugParam ?? "");
  const catalog = useCatalog();
  const { isAuthenticated } = useMobileAuth();
  const { archiveCustomExercise, restoreCustomExercise, saveNote } =
    useLocalData();
  const customs = useLocalCustomExercises();
  const templates = useLocalTemplates();
  const notes = useLocalExerciseNotes(slug ? [slug] : []);

  const [tab, setTab] = useState<Tab>("summary");
  const [metric, setMetric] = useState<ChartMetric>("weight");
  const [editOpen, setEditOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const remoteHistory = useQuery(
    api.routes.insights.queries.exerciseHistory,
    isAuthenticated && slug ? { slug, days: null } : "skip",
  );
  const remoteHistorySessions = isAuthenticated
    ? remoteHistory?.sessions
    : undefined;
  const history = useMergedExerciseHistory(
    slug,
    null,
    isAuthenticated ? remoteHistorySessions : undefined,
  );
  const records = useMergedExerciseRecords(
    slug,
    isAuthenticated ? remoteHistorySessions : undefined,
  );

  const exercise = catalog.get(slug);
  const customRow = (customs ?? []).find((item) => item.slug === slug);
  const isCustom = !!customRow;
  const archived = customRow?.archived === true;

  const usedIn = useMemo(() => {
    if (!templates) return [];
    return templates.filter((template) =>
      template.exercises.some((item) => item.slug === slug),
    );
  }, [templates, slug]);

  const chartPoints = useMemo(() => {
    if (!history?.sessions.length) return [];
    const chronological = [...history.sessions].reverse().slice(-16);
    return chronological.map((session) => sessionMetric(session, metric));
  }, [history, metric]);

  const savedNote = notes?.[slug] ?? "";
  const noteValue = noteDraft ?? savedNote;

  const editExercise: EditableCustomExercise | undefined = customRow
    ? {
        exerciseId: customRow._id,
        name: customRow.name,
        short: customRow.short ?? undefined,
        category: customRow.category,
        usesBar: customRow.usesBar,
      }
    : undefined;

  function openManage() {
    if (!customRow) return;
    const options = archived
      ? ["Cancel", "Edit", "Restore"]
      : ["Cancel", "Edit", "Archive"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: archived ? undefined : 2,
        },
        (index) => {
          if (index === 1) setEditOpen(true);
          if (index === 2) {
            if (archived) void restoreCustomExercise(customRow._id);
            else {
              Alert.alert(
                "Archive exercise?",
                `${customRow.name} will leave the catalog but stay in history.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Archive",
                    style: "destructive",
                    onPress: () => void archiveCustomExercise(customRow._id),
                  },
                ],
              );
            }
          }
        },
      );
      return;
    }
    Alert.alert("Manage", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Edit", onPress: () => setEditOpen(true) },
      archived
        ? {
            text: "Restore",
            onPress: () => void restoreCustomExercise(customRow._id),
          }
        : {
            text: "Archive",
            style: "destructive",
            onPress: () => void archiveCustomExercise(customRow._id),
          },
    ]);
  }

  async function commitNote() {
    if (noteDraft === null || noteDraft === savedNote) return;
    await saveNote(slug, noteDraft);
    setNoteDraft(null);
  }

  if (!slug) return <FullScreenLoader label="Loading exercise…" />;
  if (history === undefined || records === undefined) {
    return <FullScreenLoader label="Loading exercise…" />;
  }

  return (
    <Screen>
      <PageHeader
        back
        title={catalog.name(slug)}
        action={
          isCustom ? (
            <Pressable
              accessibilityLabel="Exercise actions"
              hitSlop={10}
              onPress={openManage}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <MoreHorizontal color={colors.text} size={22} />
            </Pressable>
          ) : undefined
        }
      />

      <Segmented value={tab} options={tabs} onChange={setTab} />

      {tab === "summary" ? (
        <View style={{ gap: 16 }}>
          <View>
            <Text
              style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}
            >
              {catalog.name(slug)}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 13, marginTop: 4 }}>
              {exercise ? muscleGroupLabel(exercise.category) : "Unknown"}
              {isCustom ? " · Custom" : ""}
              {archived ? " · Archived" : ""}
            </Text>
          </View>

          <ProgressChart points={chartPoints} />
          <Segmented
            value={metric}
            options={chartMetrics}
            onChange={setMetric}
          />

          <SectionTitle title="Personal records" />
          <Card>
            <RecordRow
              label="1RM"
              value={records.est1RM > 0 ? `${records.est1RM} lb` : "—"}
            />
            <RecordRow
              label="Best weight"
              value={
                records.bestWeight > 0
                  ? `${records.bestWeight} lb × ${records.bestReps}`
                  : "—"
              }
            />
            <RecordRow
              label="Max volume"
              value={
                records.maxVolume > 0
                  ? `${new Intl.NumberFormat().format(records.maxVolume)} lb`
                  : "—"
              }
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
      ) : null}

      {tab === "history" ? <HistoryList sessions={history.sessions} /> : null}

      {tab === "howto" ? (
        <View style={{ gap: 16 }}>
          <Card>
            <RecordRow
              label="Muscle"
              value={exercise ? muscleGroupLabel(exercise.category) : "Unknown"}
            />
            <RecordRow
              label="Barbell"
              value={
                catalog.usesBar(slug) ? "Yes — plates include the bar" : "No"
              }
            />
          </Card>

          <SectionTitle title="Your notes" />
          <TextInput
            value={noteValue}
            onChangeText={setNoteDraft}
            onBlur={() => void commitNote()}
            placeholder="What is this exercise? Add cues for next time."
            placeholderTextColor={colors.faint}
            multiline
            style={{
              minHeight: 88,
              borderWidth: 1,
              borderColor: colors.input,
              borderRadius: radius.md,
              color: colors.text,
              padding: 12,
              fontSize: 15,
              textAlignVertical: "top",
            }}
          />

          <SectionTitle title="Used in templates" />
          {templates === undefined ? (
            <Text style={{ color: colors.dim }}>Loading…</Text>
          ) : usedIn.length === 0 ? (
            <Text style={{ color: colors.dim, fontSize: 14 }}>
              Not in any of your templates yet.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {usedIn.map((template) => (
                <Pressable
                  key={template._id}
                  onPress={() =>
                    router.push({
                      pathname: "/template/[id]",
                      params: { id: template._id },
                    })
                  }
                  style={({ pressed }) => ({
                    minHeight: 44,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.surface,
                    paddingHorizontal: 14,
                    justifyContent: "center",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: colors.text, fontWeight: "600" }}>
                    {template.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {editExercise ? (
        <CustomExerciseEditor
          visible={editOpen}
          onClose={() => setEditOpen(false)}
          exercise={editExercise}
          defaultGroup={editExercise.category}
        />
      ) : null}
    </Screen>
  );
}

function ProgressChart({ points }: { points: number[] }) {
  const max = Math.max(0, ...points);
  return (
    <Card
      style={{
        minHeight: 160,
        justifyContent: "flex-end",
      }}
    >
      {points.length === 0 || max <= 0 ? (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 28 }}>
          <BarChart3 color={colors.dim} size={28} />
          <Text style={{ color: colors.dim, fontSize: 14 }}>No data yet</Text>
        </View>
      ) : (
        <View
          style={{
            height: 120,
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 3,
          }}
        >
          {points.map((value, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                minHeight: 4,
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
                backgroundColor: colors.text,
                opacity: 0.85,
                height: Math.max(4, (value / max) * 120),
              }}
            />
          ))}
        </View>
      )}
    </Card>
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
  if (!sessions.length) {
    return (
      <Text style={{ color: colors.dim }}>
        No logged sets for this exercise yet.
      </Text>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {sessions.map((session) => (
        <Pressable
          key={session.sessionId}
          onPress={() =>
            router.push({
              pathname: "/workout/recap/[sessionId]",
              params: { sessionId: session.sessionId },
            })
          }
        >
          <Card>
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
                <Text style={{ color: colors.dim, width: 34 }}>
                  #{index + 1}
                </Text>
                <Text style={{ color: colors.text, flex: 1 }}>
                  {set.weight} lb × {set.reps}
                </Text>
              </View>
            ))}
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

function RecordRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        minHeight: 28,
        alignItems: "center",
      }}
    >
      <Text style={{ color: colors.dim }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: "600", flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}
