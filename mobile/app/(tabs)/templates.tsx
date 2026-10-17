import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import {
  ArrowDownUp,
  ChevronDown,
  Download,
  Dumbbell,
  History,
  Pencil,
  Plus,
  Play,
  Search,
  Share2,
} from "lucide-react-native";
import {
  ActionSheetIOS,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useState } from "react";

import { useMobileAuth } from "@/auth/auth-provider";
import { Button, Card, EmptyState, PageHeader, Screen } from "@/components/ui";
import { DescribeWithAiButton } from "@/components/describe-with-ai-button";
import {
  PlaceChip,
  PlacePickerModal,
  useStartPlace,
} from "@/components/workout/place-machine";
import { useLocalTemplates } from "@/data/local/provider";
import { isUnsyncedTemplateRemoteId } from "@/data/local/types";
import { useCatalog } from "@/providers/catalog-provider";
import { useStartWorkout } from "@/lib/start-workout";
import { colors, radius } from "@/theme";

const TEMPLATE_SORTS = [
  { id: "edited", label: "Last edited" },
  { id: "used", label: "Last used" },
  { id: "name", label: "Name A–Z" },
] as const;
type TemplateSort = (typeof TEMPLATE_SORTS)[number]["id"];

function mapLocalTemplate(template: {
  _id: string;
  remoteId: string;
  name: string;
  updatedAt: number;
  lastPlaceId: string | null;
  lastSessionAt: number | null;
  exercises: Array<{ slug: string; sets: unknown[] }>;
}) {
  return {
    _id: template._id,
    name: template.name,
    updatedAt: template.updatedAt,
    lastSessionAt: template.lastSessionAt,
    lastPlaceId: template.lastPlaceId,
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
        const localLastUsed = new Map(
          localTemplates?.map((template) => [
            template.remoteId,
            template.lastSessionAt,
          ]),
        );
        return [
          ...unsyncedLocal,
          ...remote.map((template) => ({
            ...template,
            lastSessionAt:
              Math.max(
                template.lastSessionAt ?? 0,
                localLastUsed.get(String(template._id)) ?? 0,
              ) || null,
          })),
        ];
      })()
    : localTemplates?.map(mapLocalTemplate);
  const catalog = useCatalog();
  const { begin } = useStartWorkout();
  const startPlace = useStartPlace();
  const [placeOpen, setPlaceOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [sort, setSort] = useState<TemplateSort>("edited");
  const searchTerms = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const filteredTemplates = templates
    ?.filter((template) => {
      if (searchTerms.length === 0) return true;
      const searchableText = [
        template.name,
        ...template.exercises.flatMap(({ slug }) => [
          catalog.name(slug),
          catalog.short(slug),
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return searchTerms.every((term) => searchableText.includes(term));
    })
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "used") {
        const byLastUsed = (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0);
        if (byLastUsed !== 0) return byLastUsed;
      }
      return b.updatedAt - a.updatedAt;
    });
  const sortLabel = TEMPLATE_SORTS.find((option) => option.id === sort)!.label;

  function chooseSort() {
    Keyboard.dismiss();
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Sort templates",
        options: [...TEMPLATE_SORTS.map((option) => option.label), "Cancel"],
        cancelButtonIndex: TEMPLATE_SORTS.length,
        userInterfaceStyle: "dark",
      },
      (index) => {
        const option = TEMPLATE_SORTS[index];
        if (option) setSort(option.id);
      },
    );
  }

  return (
    <>
      <Screen>
        <PageHeader
          title="Templates"
          action={
            <Button
              size="sm"
              label="New"
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
        <PlaceChip
          name={startPlace.selected?.name ?? null}
          lastPlaceName={startPlace.lastPlace?.name}
          onPress={() => setPlaceOpen(true)}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="Quick start"
            variant="outline"
            icon={Play}
            style={{ flex: 1 }}
            onPress={() => begin(undefined, startPlace.selected?._id)}
          />
          <Button
            label="Import"
            variant="outline"
            icon={Download}
            style={{ flex: 1 }}
            onPress={() => router.push("/import-workouts")}
          />
        </View>
        {templates && templates.length > 0 ? (
          <View style={{ gap: 4 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                minHeight: 50,
                paddingLeft: 14,
                paddingRight: 8,
                borderWidth: 1,
                borderColor: searchFocused ? colors.g3 : colors.input,
                borderRadius: radius.lg,
                backgroundColor: colors.surface,
              }}
            >
              <Search
                size={18}
                color={searchFocused ? colors.text : colors.dim}
              />
              <TextInput
                accessibilityLabel="Search templates"
                accessibilityHint="Search by template name or any exercise in a template"
                value={query}
                onChangeText={setQuery}
                placeholder="Search names or exercises"
                placeholderTextColor={colors.dim}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onSubmitEditing={() => Keyboard.dismiss()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: colors.text,
                  fontSize: 16,
                  paddingVertical: 12,
                }}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text
                accessibilityLiveRegion="polite"
                style={{ flex: 1, color: colors.dim, fontSize: 12 }}
              >
                {searchTerms.length > 0
                  ? `${filteredTemplates?.length ?? 0} of ${templates.length} templates`
                  : `${templates.length} ${templates.length === 1 ? "template" : "templates"}`}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sort templates: ${sortLabel}`}
                accessibilityHint="Choose last edited, last used, or alphabetical order"
                onPress={chooseSort}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 44,
                  paddingHorizontal: 4,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <ArrowDownUp size={13} color={colors.dim} />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 12,
                    fontWeight: "500",
                  }}
                >
                  {sortLabel}
                </Text>
                <ChevronDown size={13} color={colors.dim} />
              </Pressable>
            </View>
          </View>
        ) : null}
        {templates === undefined ? (
          <Text style={{ color: colors.dim }}>Loading…</Text>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No templates yet"
            description="Quick start a workout and save it when you’re done, or build a template first."
            action={
              <View style={{ gap: 8, alignSelf: "stretch" }}>
                <DescribeWithAiButton />
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
        ) : filteredTemplates?.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matching templates"
            description="Try a different template or exercise name."
            action={
              <Button
                label="Clear search"
                variant="outline"
                onPress={() => setQuery("")}
              />
            }
          />
        ) : (
          filteredTemplates?.map((template) => (
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
                style={({ pressed }) => ({
                  opacity: pressed ? 0.7 : 1,
                  gap: 8,
                })}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 17,
                    fontWeight: "600",
                  }}
                >
                  {template.name}
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
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
                onPress={() =>
                  begin(
                    template._id,
                    template.lastPlaceId ?? startPlace.selected?._id,
                  )
                }
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
      <PlacePickerModal
        visible={placeOpen}
        onClose={() => setPlaceOpen(false)}
        places={startPlace.places}
        selectedPlaceId={startPlace.selected?._id ?? null}
        lastPlaceId={startPlace.lastPlace?._id}
        onSelect={(place) => startPlace.pick(place._id)}
      />
    </>
  );
}
