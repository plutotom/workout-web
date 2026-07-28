import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, History } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { Card, EmptyState, PageHeader, Screen } from "@/components/ui";
import { useLocalTemplate } from "@/data/local/provider";
import { isUnsyncedTemplateRemoteId } from "@/data/local/types";
import { useMergedTemplateHistory } from "@/data/local/use-local-insights";
import { useCatalog } from "@/providers/catalog-provider";
import { formatDate } from "@/lib/format";
import { colors } from "@/theme";

export default function TemplateHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const templateRouteId = id;
  const { isAuthenticated } = useMobileAuth();
  const localTemplate = useLocalTemplate(templateRouteId);
  const canQueryRemote =
    isAuthenticated &&
    Boolean(templateRouteId) &&
    !(
      localTemplate &&
      isUnsyncedTemplateRemoteId(localTemplate.remoteId) &&
      localTemplate._id === templateRouteId
    );
  const remoteTemplate = useQuery(
    api.routes.templates.queries.get,
    canQueryRemote
      ? { templateId: templateRouteId as Id<"workoutTemplates"> }
      : "skip",
  );
  const remoteSessions = useQuery(
    api.routes.workouts.queries.history,
    canQueryRemote
      ? { templateId: templateRouteId as Id<"workoutTemplates"> }
      : "skip",
  );
  const sessions = useMergedTemplateHistory(
    templateRouteId,
    canQueryRemote ? remoteSessions : undefined,
    {
      localTemplateId: localTemplate?._id,
      localRemoteTemplateId: localTemplate?.remoteId,
      templateName: remoteTemplate?.name ?? localTemplate?.name ?? "Workout",
    },
  );
  const catalog = useCatalog();
  const titleName = remoteTemplate?.name ?? localTemplate?.name;

  return (
    <Screen>
      <PageHeader back title={titleName ? `${titleName} history` : "History"} />
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
              key={session.sessionId}
              onPress={() =>
                router.push({
                  pathname: "/workout/[sessionId]",
                  params: { sessionId: session.sessionId },
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
