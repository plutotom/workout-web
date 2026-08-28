import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { AiPromptModal } from "@/components/ai-prompt-modal";
import { buildMuscleSegments, MuscleBand } from "@/components/charts";
import { ExercisePicker } from "@/components/exercise-picker";
import {
  Button,
  Card,
  Field,
  Metric,
  PageHeader,
  Screen,
} from "@/components/ui";
import { useLocalData, useLocalExerciseNotes } from "@/data/local/provider";
import { isUnsyncedTemplateRemoteId } from "@/data/local/types";
import { useAiGeneration } from "@/lib/ai";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";

type EditorExercise = {
  slug: string;
  sets: { weight: number; reps: number }[];
};

export function TemplateEditor({
  templateId,
  initial,
}: {
  templateId?: string;
  initial: { name: string; exercises: EditorExercise[] };
}) {
  const catalog = useCatalog();
  const { isAuthenticated } = useMobileAuth();
  const {
    saveTemplate,
    deleteTemplate,
    saveNote: saveLocalNote,
  } = useLocalData();
  const remove = useMutation(api.routes.templates.mutations.remove);
  const saveRemoteNote = useMutation(api.routes.exercises.mutations.upsertNote);
  const [name, setName] = useState(initial.name);
  const [exercises, setExercises] = useState(initial.exercises);
  const [expanded, setExpanded] = useState(initial.exercises.length ? 0 : -1);
  const [picker, setPicker] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const slugs = useMemo(
    () => exercises.map((exercise) => exercise.slug),
    [exercises],
  );
  const remoteNotes = useQuery(
    api.routes.exercises.queries.getNotes,
    isAuthenticated ? { slugs } : "skip",
  );
  const storedLocalNotes = useLocalExerciseNotes(slugs);
  const notes = isAuthenticated
    ? (remoteNotes ?? {})
    : { ...(storedLocalNotes ?? {}), ...localNotes };
  const setCount = exercises.reduce(
    (sum, exercise) => sum + exercise.sets.length,
    0,
  );
  const segments = buildMuscleSegments(
    exercises.map((exercise) => ({
      slug: exercise.slug,
      sets: exercise.sets.length,
    })),
    catalog,
  );
  const {
    generateTemplate,
    available: aiAvailable,
    usesApple,
  } = useAiGeneration();

  function changeExercise(
    index: number,
    transform: (exercise: EditorExercise) => EditorExercise,
  ) {
    setExercises((current) =>
      current.map((exercise, currentIndex) =>
        currentIndex === index ? transform(exercise) : exercise,
      ),
    );
  }

  function addExercises(nextSlugs: string[]) {
    setExercises((current) => [
      ...current,
      ...nextSlugs
        .filter((slug) => !current.some((exercise) => exercise.slug === slug))
        .map((slug) => ({
          slug,
          sets: Array.from({ length: 3 }, () => ({ weight: 0, reps: 0 })),
        })),
    ]);
    setExpanded(exercises.length);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= exercises.length) return;
    setExercises((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setExpanded(target);
  }

  async function persistNote(slug: string, value: string) {
    if (!isAuthenticated) {
      setLocalNotes((current) => ({ ...current, [slug]: value }));
      await saveLocalNote(slug, value);
      return;
    }
    await saveRemoteNote({ exerciseSlug: slug, notes: value });
  }

  async function save() {
    if (!name.trim() || !exercises.length) return;
    setSaving(true);
    try {
      // Local commit is authoritative. SyncCoordinator pushes to Convex when
      // an account is available (now or on a later reconnect).
      await saveTemplate({
        templateId,
        name: name.trim(),
        exercises,
      });
      router.replace("/templates");
    } catch {
      Alert.alert("Couldn’t save template", "Please try again.");
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!templateId) return;
    Alert.alert("Delete this template?", "Past workout history will be kept.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              const deleted = await deleteTemplate(templateId);
              const remoteId = deleted?.remoteId;
              if (
                isAuthenticated &&
                remoteId &&
                !isUnsyncedTemplateRemoteId(remoteId)
              ) {
                try {
                  await remove({
                    templateId: remoteId as Id<"workoutTemplates">,
                  });
                } catch {
                  // Local delete already succeeded; remote can be cleaned later.
                }
              }
              router.replace("/templates");
            } catch {
              Alert.alert("Couldn’t delete template", "Please try again.");
            }
          })();
        },
      },
    ]);
  }

  async function generate(prompt: string) {
    const result = await generateTemplate({
      prompt,
      mode: templateId ? "edit" : "create",
      current: { name, exercises },
    });
    setName(result.draft.name);
    setExercises(result.draft.exercises);
    setExpanded(result.draft.exercises.length ? 0 : -1);
  }

  return (
    <>
      <Screen>
        <PageHeader
          back
          title={templateId ? "Edit template" : "New template"}
          action={
            <Button
              size="sm"
              label={saving ? "Saving…" : "Save"}
              disabled={saving || !name.trim() || !exercises.length}
              onPress={save}
            />
          }
        />
        <Field
          label="Template name"
          value={name}
          onChangeText={setName}
          placeholder="Push Day"
        />
        {aiAvailable ? (
          <>
            <Button
              label={templateId ? "Edit with AI" : "Describe with AI"}
              variant="outline"
              icon={Sparkles}
              onPress={() => setAiOpen(true)}
            />
            <Text
              style={{
                color: colors.dim,
                fontSize: 11,
                textAlign: "center",
                marginTop: -12,
              }}
            >
              {usesApple
                ? "On this iPhone · works offline, even without an account."
                : "Build by hand, or ask AI to reshape the draft."}
            </Text>
          </>
        ) : null}

        <Card>
          <View style={{ flexDirection: "row" }}>
            <Metric value={exercises.length} label="exercises" />
            <Metric value={setCount} label="sets" />
            <Metric
              value={`~${setCount * 3 + exercises.length * 2}`}
              label="min"
            />
          </View>
          <MuscleBand segments={segments} legend />
        </Card>

        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
          Exercises
        </Text>
        {!exercises.length ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.input,
              borderStyle: "dashed",
              borderRadius: 14,
              padding: 34,
            }}
          >
            <Text style={{ color: colors.dim, textAlign: "center" }}>
              No exercises yet. Add one below.
            </Text>
          </View>
        ) : (
          exercises.map((exercise, index) => {
            const open = expanded === index;
            return (
              <Card
                key={`${exercise.slug}-${index}`}
                style={{ padding: 0, overflow: "hidden", gap: 0 }}
              >
                <Pressable
                  onPress={() => setExpanded(open ? -1 : index)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    minHeight: 62,
                    paddingHorizontal: 12,
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 2 }}>
                    <Pressable
                      hitSlop={5}
                      onPress={() => move(index, -1)}
                      disabled={index === 0}
                    >
                      <ChevronUp
                        size={19}
                        color={index === 0 ? colors.faint : colors.dim}
                      />
                    </Pressable>
                    <Pressable
                      hitSlop={5}
                      onPress={() => move(index, 1)}
                      disabled={index === exercises.length - 1}
                    >
                      <ChevronDown
                        size={19}
                        color={
                          index === exercises.length - 1
                            ? colors.faint
                            : colors.dim
                        }
                      />
                    </Pressable>
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "600",
                        fontSize: 15,
                      }}
                    >
                      {catalog.name(exercise.slug)}
                    </Text>
                    <Text
                      style={{ color: colors.dim, fontSize: 11, marginTop: 3 }}
                    >
                      {exercise.sets.length} sets
                    </Text>
                  </View>
                  {open ? (
                    <ChevronUp size={19} color={colors.dim} />
                  ) : (
                    <ChevronDown size={19} color={colors.dim} />
                  )}
                </Pressable>
                {open ? (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: colors.line,
                      padding: 12,
                      gap: 12,
                    }}
                  >
                    <Field
                      label="Exercise note"
                      value={notes[exercise.slug] ?? ""}
                      onChangeText={(value) =>
                        void persistNote(exercise.slug, value)
                      }
                      placeholder="Cues, setup, or reminders"
                      multiline
                    />
                    <View
                      style={{ flexDirection: "row", paddingHorizontal: 5 }}
                    >
                      <Text
                        style={{
                          color: colors.dim,
                          fontSize: 10,
                          width: 38,
                          textAlign: "center",
                        }}
                      >
                        SET
                      </Text>
                      <Text
                        style={{ color: colors.dim, fontSize: 10, flex: 1 }}
                      >
                        WEIGHT
                      </Text>
                      <Text
                        style={{ color: colors.dim, fontSize: 10, flex: 1 }}
                      >
                        REPS
                      </Text>
                      <View style={{ width: 34 }} />
                    </View>
                    {exercise.sets.map((set, setIndex) => (
                      <View
                        key={setIndex}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <View
                          style={{
                            width: 34,
                            height: 40,
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 9,
                            backgroundColor: colors.surface2,
                          }}
                        >
                          <Text
                            style={{ color: colors.dim, fontWeight: "600" }}
                          >
                            {setIndex + 1}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Field
                            value={set.weight ? String(set.weight) : ""}
                            keyboardType="number-pad"
                            placeholder="0"
                            onChangeText={(value) =>
                              changeExercise(index, (current) => ({
                                ...current,
                                sets: current.sets.map((row, rowIndex) =>
                                  rowIndex === setIndex
                                    ? {
                                        ...row,
                                        weight:
                                          Number(value.replace(/\D/g, "")) || 0,
                                      }
                                    : row,
                                ),
                              }))
                            }
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Field
                            value={set.reps ? String(set.reps) : ""}
                            keyboardType="number-pad"
                            placeholder="0"
                            onChangeText={(value) =>
                              changeExercise(index, (current) => ({
                                ...current,
                                sets: current.sets.map((row, rowIndex) =>
                                  rowIndex === setIndex
                                    ? {
                                        ...row,
                                        reps:
                                          Number(value.replace(/\D/g, "")) || 0,
                                      }
                                    : row,
                                ),
                              }))
                            }
                          />
                        </View>
                        <Pressable
                          disabled={exercise.sets.length <= 1}
                          onPress={() =>
                            changeExercise(index, (current) => ({
                              ...current,
                              sets: current.sets.filter(
                                (_, rowIndex) => rowIndex !== setIndex,
                              ),
                            }))
                          }
                          style={{ width: 34, alignItems: "center" }}
                        >
                          <X
                            size={18}
                            color={
                              exercise.sets.length <= 1
                                ? colors.faint
                                : colors.dim
                            }
                          />
                        </Pressable>
                      </View>
                    ))}
                    <Button
                      label="Add set"
                      variant="outline"
                      icon={Plus}
                      onPress={() =>
                        changeExercise(index, (current) => ({
                          ...current,
                          sets: [
                            ...current.sets,
                            {
                              ...(current.sets.at(-1) ?? {
                                weight: 0,
                                reps: 0,
                              }),
                            },
                          ],
                        }))
                      }
                    />
                    <Button
                      label="Remove exercise"
                      variant="ghost"
                      icon={Trash2}
                      onPress={() =>
                        setExercises((current) =>
                          current.filter(
                            (_, currentIndex) => currentIndex !== index,
                          ),
                        )
                      }
                    />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
        <Button
          label="Add exercise"
          size="lg"
          variant="outline"
          icon={Plus}
          onPress={() => setPicker(true)}
        />
        {templateId ? (
          <Button
            label="Delete template"
            variant="ghost"
            icon={Trash2}
            onPress={confirmDelete}
          />
        ) : null}
      </Screen>
      <ExercisePicker
        visible={picker}
        usedSlugs={slugs}
        onClose={() => setPicker(false)}
        onAdd={addExercises}
      />
      {aiAvailable ? (
        <AiPromptModal
          visible={aiOpen}
          title={templateId ? "Edit this template" : "Describe your workout"}
          description={
            usesApple
              ? "Runs on this iPhone — nothing is sent to Workout’s servers. Draft only until you save."
              : "AI will draft catalog exercises and set targets for you to review before saving."
          }
          loadingLabel="Building your template…"
          onDevice={usesApple}
          onClose={() => setAiOpen(false)}
          onGenerate={generate}
        />
      ) : null}
    </>
  );
}
