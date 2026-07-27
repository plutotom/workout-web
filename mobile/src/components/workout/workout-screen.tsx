import { Redirect, router } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { AiPromptModal } from "@/components/ai-prompt-modal";
import { ExercisePicker } from "@/components/exercise-picker";
import {
  Button,
  Card,
  EmptyState,
  Field,
  FullScreenLoader,
  PageHeader,
  Screen,
} from "@/components/ui";
import { PlateModal } from "@/components/workout/plate-modal";
import { RestBar } from "@/components/workout/rest-bar";
import { useAiGeneration } from "@/lib/ai";
import {
  useLocalData,
  useLocalLastSet,
  useLocalPreferences,
  useLocalWorkout,
} from "@/data/local/provider";
import type { LocalPreferences, LocalWorkoutSession } from "@/data/local/types";
import { formatClock, useRestTimer } from "@/lib/rest-timer";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";

type WorkoutSession = LocalWorkoutSession;
type WorkoutExercise = WorkoutSession["exercises"][number];
type WorkoutSet = WorkoutExercise["sets"][number];

export function WorkoutScreen({ sessionId }: { sessionId: string }) {
  useKeepAwake();
  const session = useLocalWorkout(sessionId);
  const user = useLocalPreferences();
  if (session === undefined || user === undefined)
    return <FullScreenLoader label="Loading workout…" />;
  if (!session) return <Redirect href="/(tabs)/dashboard" />;
  if (session.status !== "in_progress")
    return <CompletedWorkout session={session} />;
  return (
    <>
      <WorkoutFinishController />
      {user.activeWorkoutMode === "focus" ? (
        <FocusWorkout session={session} user={user} />
      ) : (
        <ListWorkout session={session} user={user} />
      )}
    </>
  );
}

function useElapsed(startedAt: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return formatClock(Math.floor((now - startedAt) / 1000));
}

function ElapsedSubtitle({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsed(startedAt);
  return (
    <Text
      style={{ color: colors.dim, fontSize: 13, lineHeight: 19, marginTop: 5 }}
    >
      {elapsed} elapsed
    </Text>
  );
}

function ListWorkout({
  session,
  user,
}: {
  session: WorkoutSession;
  user: LocalPreferences;
}) {
  const catalog = useCatalog();
  const {
    updateSet,
    addSet,
    deleteSet,
    addExercise,
    removeExercise,
    moveExercise,
    saveNote,
  } = useLocalData();
  const [picker, setPicker] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const rest = useRestTimer();
  const { generateSession } = useAiGeneration();

  async function addPicked(slugs: string[]) {
    for (const exerciseSlug of slugs)
      await addExercise(session._id, exerciseSlug);
  }

  async function generate(prompt: string) {
    const result = await generateSession({
      prompt,
      current: {
        exercises: session.exercises.map((exercise) => ({
          slug: exercise.slug,
          sets: exercise.sets.map((set) => ({
            completed: set.completed,
            weight: set.weight,
            reps: set.reps,
          })),
        })),
      },
    });
    const description = [
      result.draft.removeSlugs.length
        ? `Remove: ${result.draft.removeSlugs.map(catalog.short).join(", ")}`
        : null,
      result.draft.add.length
        ? `Add: ${result.draft.add.map((exercise) => catalog.short(exercise.slug)).join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    await new Promise<void>((resolve, reject) => {
      Alert.alert("Review AI changes", description || "No changes", [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => reject(new Error("Cancelled")),
        },
        {
          text: "Apply",
          onPress: () =>
            void (async () => {
              for (const slug of result.draft.removeSlugs) {
                const exercise = session.exercises.find(
                  (candidate) => candidate.slug === slug,
                );
                if (exercise) await removeExercise(exercise._id);
              }
              for (const exercise of result.draft.add) {
                await addExercise(session._id, exercise.slug);
              }
              resolve();
            })().catch(reject),
        },
      ]);
    });
  }

  return (
    <>
      <Screen contentStyle={{ paddingBottom: rest.rest ? 92 : 32 }}>
        <PageHeader
          title={session.templateName}
          subtitle={<ElapsedSubtitle startedAt={session.startedAt} />}
          back
          action={
            <Button
              size="sm"
              label="Finish"
              onPress={() => finishWorkout(session)}
            />
          }
        />
        <Button
          label="Edit workout with AI"
          variant="outline"
          icon={Sparkles}
          onPress={() => setAiOpen(true)}
        />
        {!session.exercises.length ? (
          <EmptyState
            title="No exercises yet"
            description="Add lifts as you go, or describe the session with AI."
          />
        ) : (
          session.exercises.map((exercise, exerciseIndex) => (
            <Card
              key={exercise._id}
              style={{ padding: 0, overflow: "hidden", gap: 0 }}
            >
              <View style={{ padding: 14, gap: 9 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 17,
                        fontWeight: "700",
                      }}
                    >
                      {catalog.name(exercise.slug)}
                    </Text>
                    <Text
                      style={{ color: colors.dim, fontSize: 11, marginTop: 3 }}
                    >
                      {exercise.sets.filter((set) => set.completed).length}/
                      {exercise.sets.length} sets complete ·{" "}
                      {exercise.restSeconds}s rest
                    </Text>
                  </View>
                  <Pressable
                    disabled={exerciseIndex === 0}
                    hitSlop={7}
                    onPress={() => void moveExercise(exercise._id, -1)}
                  >
                    <ChevronUp
                      size={20}
                      color={exerciseIndex === 0 ? colors.faint : colors.dim}
                    />
                  </Pressable>
                  <Pressable
                    disabled={exerciseIndex === session.exercises.length - 1}
                    hitSlop={7}
                    onPress={() => void moveExercise(exercise._id, 1)}
                  >
                    <ChevronDown
                      size={20}
                      color={
                        exerciseIndex === session.exercises.length - 1
                          ? colors.faint
                          : colors.dim
                      }
                    />
                  </Pressable>
                </View>
                <NoteField
                  initial={exercise.notes ?? ""}
                  onSave={(notes) => saveNote(exercise.slug, notes)}
                />
              </View>
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  padding: 12,
                  gap: 9,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text
                    style={{
                      color: colors.dim,
                      fontSize: 10,
                      width: 35,
                      textAlign: "center",
                    }}
                  >
                    SET
                  </Text>
                  <Text style={{ color: colors.dim, fontSize: 10, flex: 1 }}>
                    WEIGHT
                  </Text>
                  <Text style={{ color: colors.dim, fontSize: 10, flex: 1 }}>
                    REPS
                  </Text>
                  <View style={{ width: 44 }} />
                </View>
                {exercise.sets.map((set, setIndex) => (
                  <SetRow
                    key={set._id}
                    set={set}
                    index={setIndex}
                    unit={user.unit}
                    barWeight={
                      user.unit === "lb"
                        ? (user.barWeightLb ?? 45)
                        : (user.barWeightKg ?? 20)
                    }
                    usesBar={catalog.usesBar(exercise.slug)}
                    onCommit={(values) => updateSet(set._id, values)}
                    onComplete={(completed, values) => {
                      void updateSet(set._id, { ...values, completed });
                      if (completed) {
                        void Haptics.notificationAsync(
                          Haptics.NotificationFeedbackType.Success,
                        );
                        if (user.restTimerEnabled ?? true)
                          void rest.start(
                            exercise.restSeconds,
                            `Next: ${catalog.short(exercise.slug)} · set ${setIndex + 2}`,
                          );
                      }
                    }}
                    onDelete={() => void deleteSet(set._id)}
                    canDelete={exercise.sets.length > 1}
                  />
                ))}
                <Button
                  label="Add set"
                  variant="outline"
                  icon={Plus}
                  onPress={async () => {
                    await addSet(exercise._id);
                  }}
                />
                <Button
                  label="Remove exercise"
                  variant="ghost"
                  icon={Trash2}
                  onPress={() =>
                    Alert.alert(
                      "Remove exercise?",
                      catalog.name(exercise.slug),
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => void removeExercise(exercise._id),
                        },
                      ],
                    )
                  }
                />
              </View>
            </Card>
          ))
        )}
        <Button
          label="Add exercise"
          size="lg"
          variant="outline"
          icon={Plus}
          onPress={() => setPicker(true)}
        />
      </Screen>
      {rest.rest ? (
        <RestBar
          remaining={rest.remaining}
          label={rest.rest.label}
          onAdd={rest.add}
          onClear={() => void rest.clear()}
        />
      ) : null}
      <ExercisePicker
        visible={picker}
        usedSlugs={session.exercises.map((exercise) => exercise.slug)}
        onClose={() => setPicker(false)}
        onAdd={(slugs) => void addPicked(slugs)}
      />
      <AiPromptModal
        visible={aiOpen}
        title="Reshape this workout"
        description="Ask for additions, removals, or a new direction. You’ll review the exact draft before it changes the session."
        onClose={() => setAiOpen(false)}
        onGenerate={generate}
      />
    </>
  );
}

function SetRow({
  set,
  index,
  unit,
  barWeight,
  usesBar,
  onCommit,
  onComplete,
  onDelete,
  canDelete,
}: {
  set: WorkoutSet;
  index: number;
  unit: "lb" | "kg";
  barWeight: number;
  usesBar: boolean;
  onCommit: (values: { weight: number; reps: number }) => Promise<unknown>;
  onComplete: (
    completed: boolean,
    values: { weight: number; reps: number },
  ) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [weight, setWeight] = useState(String(set.weight || ""));
  const [reps, setReps] = useState(String(set.reps || ""));
  const [plates, setPlates] = useState(false);
  const values = { weight: Number(weight) || 0, reps: Number(reps) || 0 };
  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          opacity: set.completed ? 0.76 : 1,
        }}
      >
        <Pressable
          onLongPress={canDelete ? onDelete : undefined}
          style={{
            width: 34,
            height: 42,
            borderRadius: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: set.completed
              ? `${colors.success}22`
              : colors.surface2,
          }}
        >
          <Text
            style={{
              color: set.completed ? colors.success : colors.dim,
              fontWeight: "700",
            }}
          >
            {index + 1}
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Field
            value={weight}
            onChangeText={(value) => setWeight(value.replace(/[^0-9.]/g, ""))}
            onBlur={() => void onCommit(values)}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </View>
        {usesBar ? (
          <Pressable onPress={() => setPlates(true)} hitSlop={5}>
            <CircleDot size={17} color={colors.dim} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Field
            value={reps}
            onChangeText={(value) => setReps(value.replace(/\D/g, ""))}
            onBlur={() => void onCommit(values)}
            keyboardType="number-pad"
            placeholder="0"
          />
        </View>
        <Pressable
          onPress={() => onComplete(!set.completed, values)}
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: set.completed ? colors.success : colors.input,
            backgroundColor: set.completed ? colors.success : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check
            size={21}
            strokeWidth={3}
            color={set.completed ? colors.bg : colors.faint}
          />
        </Pressable>
      </View>
      <PlateModal
        visible={plates}
        target={values.weight}
        unit={unit}
        barWeight={barWeight}
        onClose={() => setPlates(false)}
        onApply={(next) => {
          setWeight(String(next));
          void onCommit({ ...values, weight: next });
        }}
      />
    </>
  );
}

function NoteField({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (notes: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Field
      value={value}
      onChangeText={setValue}
      onBlur={() => void onSave(value)}
      placeholder="Exercise note"
    />
  );
}

function FocusWorkout({
  session,
  user,
}: {
  session: WorkoutSession;
  user: LocalPreferences;
}) {
  const catalog = useCatalog();
  const allSets = useMemo(
    () =>
      session.exercises.flatMap((exercise, exerciseIndex) =>
        exercise.sets.map((set, setIndex) => ({
          exercise,
          exerciseIndex,
          set,
          setIndex,
        })),
      ),
    [session.exercises],
  );
  const firstIncomplete = allSets.findIndex((item) => !item.set.completed);
  const [position, setPosition] = useState(Math.max(0, firstIncomplete));
  const item = allSets[Math.min(position, Math.max(0, allSets.length - 1))];
  const rest = useRestTimer();
  const { updateSet } = useLocalData();
  const [drafts, setDrafts] = useState<
    Record<string, { weight: string; reps: string }>
  >({});
  const [plates, setPlates] = useState(false);
  const last = useLocalLastSet(item?.exercise.slug);

  if (!item) {
    return (
      <Screen>
        <PageHeader
          back
          title={session.templateName}
          action={
            <Button
              size="sm"
              label="Finish"
              onPress={() => finishWorkout(session)}
            />
          }
        />
        <EmptyState
          title="No sets yet"
          description="Switch to List mode in Settings to add exercises and sets."
        />
      </Screen>
    );
  }
  const draft = drafts[item.set._id] ?? {
    weight: String(item.set.weight || ""),
    reps: String(item.set.reps || ""),
  };
  const values = {
    weight: Number(draft.weight) || 0,
    reps: Number(draft.reps) || 0,
  };
  const usesBar = catalog.usesBar(item.exercise.slug);
  const barWeight =
    user.unit === "lb" ? (user.barWeightLb ?? 45) : (user.barWeightKg ?? 20);
  const done = session.exercises.reduce(
    (sum, exercise) =>
      sum + exercise.sets.filter((set) => set.completed).length,
    0,
  );

  async function complete() {
    await updateSet(item.set._id, { ...values, completed: true });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (user.restTimerEnabled ?? true)
      void rest.start(item.exercise.restSeconds, "Recover, then keep moving");
    const next = allSets.findIndex(
      (candidate, index) => index > position && !candidate.set.completed,
    );
    if (next >= 0) setPosition(next);
  }

  return (
    <>
      <Screen
        scroll={false}
        contentStyle={{ flex: 1, paddingBottom: rest.rest ? 92 : 20 }}
      >
        <PageHeader
          back
          eyebrow={`${done}/${allSets.length} SETS`}
          title={session.templateName}
          action={
            <Button
              size="sm"
              label="Finish"
              onPress={() => finishWorkout(session)}
            />
          }
        />
        <View style={{ flex: 1, justifyContent: "center", gap: 24 }}>
          <View>
            <Text
              style={{
                color: colors.dim,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 1.8,
              }}
            >
              SET {item.setIndex + 1} · {item.exerciseIndex + 1}/
              {session.exercises.length}
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: 34,
                lineHeight: 38,
                fontWeight: "700",
                marginTop: 8,
              }}
            >
              {catalog.name(item.exercise.slug)}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 13, marginTop: 8 }}>
              {last
                ? `Last time · ${last.weight} ${user.unit} × ${last.reps}`
                : "First logged session for this lift"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field
                label={`Weight (${user.unit})`}
                value={draft.weight}
                onChangeText={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [item.set._id]: {
                      ...draft,
                      weight: value.replace(/[^0-9.]/g, ""),
                    },
                  }))
                }
                keyboardType="decimal-pad"
              />
            </View>
            {usesBar ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open plate calculator"
                hitSlop={7}
                onPress={() => setPlates(true)}
                style={({ pressed }) => ({
                  width: 44,
                  height: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.input,
                  backgroundColor: colors.surface2,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 20,
                  opacity: pressed ? 0.7 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <CircleDot size={20} color={colors.text} strokeWidth={2.3} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Field
                label="Reps"
                value={draft.reps}
                onChangeText={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [item.set._id]: {
                      ...draft,
                      reps: value.replace(/\D/g, ""),
                    },
                  }))
                }
                keyboardType="number-pad"
              />
            </View>
          </View>
          <Button
            label={item.set.completed ? "Set completed" : "Complete set"}
            size="lg"
            variant={item.set.completed ? "success" : "primary"}
            icon={Check}
            disabled={item.set.completed}
            onPress={complete}
          />
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Button
              label="Previous"
              variant="ghost"
              icon={ChevronLeft}
              disabled={position === 0}
              onPress={() => setPosition((current) => Math.max(0, current - 1))}
            />
            <Button
              label="Next"
              variant="ghost"
              icon={ChevronRight}
              disabled={position >= allSets.length - 1}
              onPress={() =>
                setPosition((current) =>
                  Math.min(allSets.length - 1, current + 1),
                )
              }
            />
          </View>
        </View>
      </Screen>
      <PlateModal
        visible={plates}
        target={values.weight}
        unit={user.unit}
        barWeight={barWeight}
        onClose={() => setPlates(false)}
        onApply={(next) => {
          setDrafts((current) => ({
            ...current,
            [item.set._id]: { ...draft, weight: String(next) },
          }));
          void updateSet(item.set._id, { ...values, weight: next });
        }}
      />
      {rest.rest ? (
        <RestBar
          remaining={rest.remaining}
          label={rest.rest.label}
          onAdd={rest.add}
          onClear={() => void rest.clear()}
        />
      ) : null}
    </>
  );
}

async function finishWorkout(session: WorkoutSession) {
  // The hook-based mutations live in a tiny component mounted by this helper's caller.
  finishController?.(session);
}

let finishController: ((session: WorkoutSession) => void) | null = null;

export function WorkoutFinishController() {
  const { finish, abandon } = useLocalData();

  useEffect(() => {
    finishController = (session) => {
      const hasWork = session.exercises.some((exercise) =>
        exercise.sets.some((set) => set.completed && set.reps > 0),
      );
      const unchecked = session.exercises.some((exercise) =>
        exercise.sets.some((set) => !set.completed),
      );
      if (!session.exercises.length || !hasWork) {
        Alert.alert(
          "Discard this workout?",
          "There are no completed sets to save.",
          [
            { text: "Keep training", style: "cancel" },
            {
              text: "Discard",
              style: "destructive",
              onPress: () =>
                void abandon(session._id).then(() =>
                  router.replace("/(tabs)/dashboard"),
                ),
            },
          ],
        );
        return;
      }

      const commit = async () => {
        await finish(session._id);
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      };

      if (unchecked) {
        Alert.alert("Finish this workout?", "Some sets aren’t checked off.", [
          { text: "Keep training", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () =>
              void abandon(session._id).then(() =>
                router.replace("/(tabs)/dashboard"),
              ),
          },
          { text: "Save workout", onPress: () => void commit() },
        ]);
      } else void commit();
    };
    return () => {
      finishController = null;
    };
  }, [abandon, finish]);
  return null;
}

function CompletedWorkout({ session }: { session: WorkoutSession }) {
  const catalog = useCatalog();
  const { deleteSession } = useLocalData();
  return (
    <Screen>
      <PageHeader
        back
        title={session.templateName}
        subtitle={
          session.completedAt
            ? new Date(session.completedAt).toLocaleString()
            : "Finished workout"
        }
      />
      {session.exercises.map((exercise) => (
        <Card key={exercise._id}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
            {catalog.name(exercise.slug)}
          </Text>
          {exercise.sets.map((set, index) => (
            <Text
              key={set._id}
              style={{
                color: set.completed ? colors.text : colors.faint,
                fontSize: 13,
              }}
            >
              Set {index + 1} · {set.weight} × {set.reps}
              {set.completed ? " ✓" : ""}
            </Text>
          ))}
        </Card>
      ))}
      <Button
        label="Done"
        onPress={() => router.replace("/(tabs)/dashboard")}
      />
      <Button
        label="Delete workout"
        variant="ghost"
        icon={Trash2}
        onPress={() =>
          Alert.alert("Delete this workout?", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () =>
                void deleteSession(session._id).then(() =>
                  router.replace("/(tabs)/insights"),
                ),
            },
          ])
        }
      />
    </Screen>
  );
}
