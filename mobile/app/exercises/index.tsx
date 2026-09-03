import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { ChevronRight, Plus, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import type { MuscleGroup } from "@shared/exercises";
import {
  browseExercises,
  EXERCISE_SORTS,
  type ExerciseSort,
} from "@shared/exercise-browser";

import { useMobileAuth } from "@/auth/auth-provider";
import { CustomExerciseEditor } from "@/components/custom-exercise-editor";
import { Button, PageHeader, Screen } from "@/components/ui";
import { useLocalInsightsLifts } from "@/data/local/use-local-insights";
import {
  muscleFilterLabel,
  pickExerciseSort,
  pickMuscleGroup,
} from "@/lib/exercise-filters";
import { useCatalog } from "@/providers/catalog-provider";
import { colors, radius } from "@/theme";

export default function ExercisesScreen() {
  const catalog = useCatalog();
  const { isAuthenticated } = useMobileAuth();
  const remoteLifts = useQuery(
    api.routes.insights.queries.lifts,
    isAuthenticated ? { days: null } : "skip",
  );
  const localLifts = useLocalInsightsLifts(null);
  const lifts = isAuthenticated ? remoteLifts : localLifts;

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [sort, setSort] = useState<ExerciseSort>("az");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const lastUsedAt = useMemo(() => {
    const map = new Map<string, number>();
    for (const lift of lifts ?? []) {
      if (
        "lastCompletedAt" in lift &&
        typeof lift.lastCompletedAt === "number"
      ) {
        map.set(lift.slug, lift.lastCompletedAt);
      }
    }
    return map;
  }, [lifts]);

  const rows = useMemo(
    () =>
      browseExercises(catalog.all, catalog.archived, {
        query,
        group,
        sort,
        lastUsedAt,
        includeArchived,
        customOnly: false,
      }),
    [
      catalog.all,
      catalog.archived,
      query,
      group,
      sort,
      lastUsedAt,
      includeArchived,
    ],
  );

  const sortLabel =
    EXERCISE_SORTS.find((item) => item.id === sort)?.label ?? "A–Z";

  return (
    <Screen
      scroll={false}
      contentStyle={{ paddingBottom: 0, gap: 12, flex: 1 }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
        <PageHeader
          back
          title="Exercises"
          action={
            <Button
              label="Create"
              size="sm"
              icon={Plus}
              onPress={() => setCreateOpen(true)}
            />
          }
        />

        <View
          style={{
            height: 44,
            borderRadius: radius.md,
            borderColor: colors.input,
            borderWidth: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            paddingHorizontal: 12,
          }}
        >
          <Search size={17} color={colors.dim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor={colors.faint}
            style={{ flex: 1, color: colors.text, fontSize: 16 }}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => pickMuscleGroup(group, setGroup)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.input,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.text, fontSize: 15, flex: 1 }}
            >
              {muscleFilterLabel(group)}
            </Text>
            <ChevronRight
              color={colors.dim}
              size={16}
              style={{ transform: [{ rotate: "90deg" }] }}
            />
          </Pressable>
          <Pressable
            onPress={() => pickExerciseSort(sort, setSort)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.input,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.text, fontSize: 15, flex: 1 }}
            >
              {sortLabel}
            </Text>
            <ChevronRight
              color={colors.dim}
              size={16}
              style={{ transform: [{ rotate: "90deg" }] }}
            />
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 44,
          }}
        >
          <Text style={{ color: colors.dim, fontSize: 14 }}>Show archived</Text>
          <Switch
            value={includeArchived}
            onValueChange={setIncludeArchived}
            trackColor={{ false: colors.input, true: colors.action }}
          />
        </View>
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text
            style={{
              color: colors.dim,
              textAlign: "center",
              marginTop: 40,
              fontSize: 14,
            }}
          >
            No matches
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/exercises/[slug]",
                params: { slug: item.slug },
              })
            }
            style={({ pressed }) => ({
              minHeight: 56,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                backgroundColor: colors.surface2,
              }}
            />
            <View style={{ flex: 1, minWidth: 0, paddingVertical: 12 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "600",
                    flexShrink: 1,
                  }}
                >
                  {item.name}
                </Text>
                {item.custom ? (
                  <Text
                    style={{
                      color: colors.dim,
                      fontSize: 10,
                      fontWeight: "700",
                      letterSpacing: 0.6,
                      backgroundColor: colors.surface2,
                      overflow: "hidden",
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}
                  >
                    {item.archived ? "ARCHIVED" : "CUSTOM"}
                  </Text>
                ) : null}
              </View>
              <Text style={{ color: colors.dim, fontSize: 13, marginTop: 2 }}>
                {muscleFilterLabel(item.category)}
              </Text>
            </View>
            <ChevronRight color={colors.faint} size={17} />
          </Pressable>
        )}
      />

      <CustomExerciseEditor
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultGroup={group === "all" ? "chest" : group}
        onSaved={(slug) =>
          router.push({
            pathname: "/exercises/[slug]",
            params: { slug },
          })
        }
      />
    </Screen>
  );
}
