import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { Dumbbell, History, Pencil, Plus, Play } from "lucide-react-native";
import { Text, View } from "react-native";

import { Button, Card, EmptyState, PageHeader, Screen } from "@/components/ui";
import { useCatalog } from "@/providers/catalog-provider";
import { useStartWorkout } from "@/lib/start-workout";
import { colors } from "@/theme";

export default function TemplatesScreen() {
  const templates = useQuery(api.routes.templates.queries.list);
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
      <Button
        label="Quick start"
        variant="outline"
        icon={Play}
        onPress={() => begin()}
      />
      {templates === undefined ? (
        <Text style={{ color: colors.dim }}>Loading…</Text>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No templates yet"
          description="Quick start a workout and save it when you’re done, or build a template first."
          action={
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
          }
        />
      ) : (
        templates.map((template) => (
          <Card key={template._id}>
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
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
