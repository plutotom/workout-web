import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, History } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Card, EmptyState, PageHeader, Screen } from "@/components/ui";
import { useCatalog } from "@/providers/catalog-provider";
import { formatDate } from "@/lib/format";
import { colors } from "@/theme";

export default function TemplateHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const templateId = id as Id<"workoutTemplates">;
  const template = useQuery(api.routes.templates.queries.get, { templateId });
  const sessions = useQuery(api.routes.workouts.queries.history, {
    templateId,
  });
  const catalog = useCatalog();

  return (
    <Screen>
      <PageHeader
        back
        title={template ? `${template.name} history` : "History"}
      />
      {sessions === undefined ? (
        <Text style={{ color: colors.dim }}>Loading…</Text>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={History}
          title="No sessions yet"
          description="Finished workouts from this template will appear here."
        />
      ) : (
        sessions.map((session) => {
          const completed = session.exercises.filter(
            (exercise) => exercise.completedCount > 0,
          );
          const summary = completed.length
            ? completed
                .map(
                  (exercise) =>
                    `${catalog.short(exercise.slug)} ${exercise.completedCount}`,
                )
                .join(" · ")
            : "No sets checked off";
          return (
            <Pressable
              key={session._id}
              onPress={() =>
                router.push({
                  pathname: "/workout/[sessionId]",
                  params: { sessionId: String(session._id) },
                })
              }
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <Card style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {formatDate(session.completedAt)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.dim, fontSize: 11, marginTop: 4 }}
                  >
                    {summary}
                  </Text>
                </View>
                <ChevronRight color={colors.dim} size={20} />
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
