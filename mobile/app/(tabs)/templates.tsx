import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import {
  Download,
  Dumbbell,
  History,
  Pencil,
  Plus,
  Play,
  Share2,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { Button, Card, EmptyState, PageHeader, Screen } from "@/components/ui";
import { useLocalTemplates } from "@/data/local/provider";
import { isUnsyncedTemplateRemoteId } from "@/data/local/types";
import { useCatalog } from "@/providers/catalog-provider";
import { useStartWorkout } from "@/lib/start-workout";
import { colors } from "@/theme";

function mapLocalTemplate(template: {
  _id: string;
  remoteId: string;
  name: string;
  updatedAt: number;
  exercises: Array<{ slug: string; sets: unknown[] }>;
}) {
  return {
    _id: template._id,
    name: template.name,
    updatedAt: template.updatedAt,
    lastSessionAt: null as number | null,
    exercises: template.exercises.map((exercise) => ({
      slug: exercise.slug,
      setCount: exercise.sets.length,
    })),
  };
}

export default function TemplatesScreen() {
  const { isAuthenticated } = useMobileAuth();
  const remoteTemplates = useQuery(
    api.routes.templates.queries.list,
    isAuthenticated ? {} : "skip",
  );
  const localTemplates = useLocalTemplates();
  const templates = isAuthenticated
    ? (() => {
        if (remoteTemplates === undefined && localTemplates === undefined) {
          return undefined;
        }
        const remote = remoteTemplates ?? [];
        const remoteIds = new Set(
          remote.map((template) => String(template._id)),
        );
        const unsyncedLocal =
          localTemplates
            ?.filter(
              (template) =>
                isUnsyncedTemplateRemoteId(template.remoteId) ||
                !remoteIds.has(template.remoteId),
            )
            .map(mapLocalTemplate) ?? [];
        if (remoteTemplates === undefined) {
          return localTemplates?.map(mapLocalTemplate);
        }
        return [...unsyncedLocal, ...remote];
      })()
    : localTemplates?.map(mapLocalTemplate);
  const catalog = useCatalog();
  const { begin } = useStartWorkout();

  return (
    <Screen>
      <PageHeader
        title="Templates"
        action={
          <Button
            size="sm"
            label="New"
            icon={Plus}
            onPress={() =>
              router.push({ pathname: "/template/[id]", params: { id: "new" } })
            }
          />
        }
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="Quick start"
          variant="outline"
          icon={Play}
          style={{ flex: 1 }}
          onPress={() => begin()}
        />
        <Button
          label="Import"
          variant="outline"
          icon={Download}
          style={{ flex: 1 }}
          onPress={() => router.push("/import-workouts")}
        />
      </View>
      {templates === undefined ? (
        <Text style={{ color: colors.dim }}>Loading…</Text>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No templates yet"
          description="Quick start a workout and save it when you’re done, or build a template first."
          action={
            <View style={{ gap: 8, alignSelf: "stretch" }}>
              <Button
                label="New template"
                icon={Plus}
                onPress={() =>
                  router.push({
                    pathname: "/template/[id]",
                    params: { id: "new" },
                  })
                }
              />
              <Button
                label="Import from a friend"
                variant="outline"
                icon={Download}
                onPress={() => router.push("/import-workouts")}
              />
            </View>
          }
        />
      ) : (
        templates.map((template) => (
          <Card key={template._id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Preview ${template.name}`}
              onPress={() =>
                router.push({
                  pathname: "/template/preview/[id]",
                  params: { id: String(template._id) },
                })
              }
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 8 })}
            >
              <Text
                style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}
              >
                {template.name}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {template.exercises.slice(0, 4).map((exercise) => (
                  <Text
                    key={exercise.slug}
                    style={{
                      color: colors.dim,
                      fontSize: 11,
                      backgroundColor: colors.surface2,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 99,
                    }}
                  >
                    {catalog.short(exercise.slug)}
                  </Text>
                ))}
                {template.exercises.length > 4 ? (
                  <Text
                    style={{
                      color: colors.dim,
                      fontSize: 11,
                      backgroundColor: colors.surface2,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 99,
                    }}
                  >
                    +{template.exercises.length - 4} more
                  </Text>
                ) : null}
              </View>
              <Text style={{ color: colors.dim, fontSize: 11 }}>
                {template.lastSessionAt
                  ? `Last: ${new Date(template.lastSessionAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                  : "No sessions yet"}
              </Text>
            </Pressable>
            <Button
              label="Start workout"
              icon={Play}
              onPress={() => begin(template._id)}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                label="Edit"
                variant="outline"
                icon={Pencil}
                style={{ flex: 1 }}
                onPress={() =>
                  router.push({
                    pathname: "/template/[id]",
                    params: { id: String(template._id) },
                  })
                }
              />
              <Button
                label="History"
                variant="outline"
                icon={History}
                style={{ flex: 1 }}
                onPress={() =>
                  router.push({
                    pathname: "/template/history/[id]",
                    params: { id: String(template._id) },
                  })
                }
              />
              <Button
                label="Share"
                variant="outline"
                icon={Share2}
                style={{ flex: 1 }}
                onPress={() =>
                  router.push({
                    pathname: "/share-workouts",
                    params: { templateId: String(template._id) },
                  })
                }
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
