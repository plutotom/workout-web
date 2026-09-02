import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { History, Pencil, Play, Share2 } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import {
  Button,
  EmptyState,
  FullScreenLoader,
  PageHeader,
  Screen,
} from "@/components/ui";
import {
  useLocalExerciseNotes,
  useLocalPreferences,
  useLocalTemplate,
} from "@/data/local/provider";
import { isUnsyncedTemplateRemoteId } from "@/data/local/types";
import { useStartWorkout } from "@/lib/start-workout";
import {
  PlaceChip,
  PlacePickerModal,
  useStartPlace,
} from "@/components/workout/place-machine";
import { useCatalog } from "@/providers/catalog-provider";
import { colors, radius } from "@/theme";

type PreviewExercise = {
  slug: string;
  sets: { weight: number; reps: number }[];
  notes?: string;
};

function TemplatePreviewView({
  templateId,
  name,
  exercises,
  unit,
}: {
  templateId: string;
  name: string;
  exercises: PreviewExercise[];
  unit: "lb" | "kg";
}) {
  const catalog = useCatalog();
  const { begin } = useStartWorkout();
  const startPlace = useStartPlace(templateId);
  const [placeOpen, setPlaceOpen] = useState(false);

  return (
    <Screen>
      <PageHeader back title={name} />
      <PlaceChip
        name={startPlace.selected?.name ?? null}
        lastPlaceName={startPlace.lastPlace?.name}
        onPress={() => setPlaceOpen(true)}
      />
      <Button
        label="Start workout"
        icon={Play}
        onPress={() => begin(templateId, startPlace.selected?._id)}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
          Exercises
        </Text>
        <Button
          label="Edit"
          variant="ghost"
          size="sm"
          icon={Pencil}
          onPress={() =>
            router.push({
              pathname: "/template/[id]",
              params: { id: templateId },
            })
          }
        />
      </View>

      {exercises.length === 0 ? (
        <Text style={{ color: colors.dim, fontSize: 13 }}>
          No exercises yet. Edit this template to add some.
        </Text>
      ) : (
        exercises.map((exercise) => (
          <View
            key={exercise.slug}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: radius.lg,
              padding: 14,
              gap: 10,
            }}
          >
            <Text
              style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
            >
              {catalog.name(exercise.slug)}
            </Text>
            {exercise.notes ? (
              <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 18 }}>
                {exercise.notes}
              </Text>
            ) : null}
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.md,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: colors.surface2,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text
                  style={{
                    color: colors.dim,
                    fontSize: 11,
                    fontWeight: "600",
                    width: 44,
                    textTransform: "uppercase",
                  }}
                >
                  Set
                </Text>
                <Text
                  style={{
                    color: colors.dim,
                    fontSize: 11,
                    fontWeight: "600",
                    flex: 1,
                    textAlign: "right",
                    textTransform: "uppercase",
                  }}
                >
                  {unit}
                </Text>
                <Text
                  style={{
                    color: colors.dim,
                    fontSize: 11,
                    fontWeight: "600",
                    flex: 1,
                    textAlign: "right",
                    textTransform: "uppercase",
                  }}
                >
                  Reps
                </Text>
              </View>
              {exercise.sets.map((set, index) => (
                <View
                  key={`${exercise.slug}-${index}`}
                  style={{
                    flexDirection: "row",
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: colors.dim, fontSize: 14, width: 44 }}>
                    {index + 1}
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      flex: 1,
                      textAlign: "right",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {set.weight > 0 ? set.weight : "—"}
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      flex: 1,
                      textAlign: "right",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {set.reps > 0 ? set.reps : "—"}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))
      )}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="History"
          variant="outline"
          icon={History}
          style={{ flex: 1 }}
          onPress={() =>
            router.push({
              pathname: "/template/history/[id]",
              params: { id: templateId },
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
              params: { templateId },
            })
          }
        />
      </View>
      <PlacePickerModal
        visible={placeOpen}
        onClose={() => setPlaceOpen(false)}
        places={startPlace.places}
        selectedPlaceId={startPlace.selected?._id ?? null}
        lastPlaceId={startPlace.lastPlace?._id}
        onSelect={(place) => startPlace.pick(place._id)}
      />
    </Screen>
  );
}

export function TemplatePreview({
  templateRouteId,
}: {
  templateRouteId: string;
}) {
  const { isAuthenticated } = useMobileAuth();
  const preferences = useLocalPreferences();
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
  const noteSlugs =
    remoteTemplate?.exercises.map((exercise) => exercise.slug) ??
    localTemplate?.exercises.map((exercise) => exercise.slug) ??
    [];
  const localNotes = useLocalExerciseNotes(noteSlugs);

  if (
    (canQueryRemote &&
      remoteTemplate === undefined &&
      localTemplate === undefined) ||
    (!canQueryRemote && localTemplate === undefined) ||
    preferences === undefined
  ) {
    return <FullScreenLoader label="Loading template…" />;
  }

  const source = remoteTemplate ?? localTemplate;
  if (!source) {
    return (
      <Screen>
        <PageHeader back title="Template" />
        <EmptyState
          title="Template not found"
          description="It may have been deleted."
        />
      </Screen>
    );
  }

  const exercises: PreviewExercise[] =
    remoteTemplate?.exercises.map((exercise) => ({
      slug: exercise.slug,
      sets: exercise.sets,
      notes: exercise.notes,
    })) ??
    localTemplate?.exercises.map((exercise) => ({
      slug: exercise.slug,
      sets: exercise.sets,
      notes: localNotes?.[exercise.slug],
    })) ??
    [];

  return (
    <TemplatePreviewView
      templateId={templateRouteId}
      name={source.name}
      exercises={exercises}
      unit={preferences.unit}
    />
  );
}
