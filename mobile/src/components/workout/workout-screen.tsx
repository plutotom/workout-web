import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useQuery } from "convex/react";
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
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useMobileAuth } from "@/auth/auth-provider";
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
import { WatchCompanionCard } from "@/health/watch-companion-card";
import { useSessionAi } from "@/components/workout/use-session-ai";
import { formatDate, formatDuration, formatWeight } from "@/lib/format";
import { formatHealthDistance, formatHealthEnergy } from "@/health/mapping";
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

/**
 * What the read-only view needs, and no more, so it renders a session from
 * SQLite or one fetched from Convex without either side pretending to be the
 * other.
 */
type PastWorkout = {
  _id: string;
  status: string;
  templateName: string;
  startedAt: number;
  completedAt?: number;
  sessionKind?: "tracked" | "health_summary";
  sourceName?: string | null;
  activityType?: string | null;
  durationSeconds?: number | null;
  energyKcal?: number | null;
  distanceMeters?: number | null;
  health?: LocalWorkoutSession["health"];
  exercises: Array<{
    _id: string;
    slug: string;
    notes?: string;
    sets: Array<{
      _id: string;
      weight: number;
      reps: number;
      completed: boolean;
    }>;
  }>;
};

export function WorkoutScreen({ sessionId }: { sessionId: string }) {
  useKeepAwake();
  const session = useLocalWorkout(sessionId);
  const user = useLocalPreferences();
  const { isAuthenticated } = useMobileAuth();
  // Workouts logged on the web never land in SQLite — the bootstrap only
  // carries templates, notes and preferences — so a local miss falls back to
  // the server rather than bouncing the user to the dashboard.
  const remote = useQuery(
    api.routes.workouts.queries.get,
    session === null && isAuthenticated
      ? { sessionId: sessionId as Id<"workoutSessions"> }
      : "skip",
  );

  if (session === undefined || user === undefined)
    return <FullScreenLoader label="Loading workout…" />;
  if (!session) {
    if (!isAuthenticated || remote === null)
      return <Redirect href="/dashboard" />;
    if (remote === undefined)
      return <FullScreenLoader label="Loading workout…" />;
    // Remote-only sessions are read-only here: editing and deleting both go
    // through the local store, which has never seen them.
    return <CompletedWorkout session={remote} canDelete={false} />;
  }
  // The controller stays mounted across the finish transition: its post-finish
  // prompts open once the session is already `completed`, and unmounting here
  // would tear them down before the user could answer.
  return (
    <>
      <WorkoutFinishController />
      {session.status !== "in_progress" ? (
        <CompletedWorkout session={session} canDelete />
      ) : user.activeWorkoutMode === "focus" ? (
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
  // Collapsed cards are opt-in and independent, so a session can mix open and
  // closed exercises. Missing id means expanded.
  const [collapsed, setCollapsed] = useState<Record<string, true>>({});
  const rest = useRestTimer({
    notificationsEnabled: user.restTimerNotificationsEnabled,
  });
  const { aiAvailable, usesApple, aiOpen, setAiOpen, generate } =
    useSessionAi(session);

  function toggleCollapsed(exerciseId: string) {
    void Haptics.selectionAsync();
    setCollapsed((current) => {
      const next = { ...current };
      if (next[exerciseId]) delete next[exerciseId];
      else next[exerciseId] = true;
      return next;
    });
  }

  async function addPicked(slugs: string[]) {
    for (const exerciseSlug of slugs)
      await addExercise(session._id, exerciseSlug);
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
        <WatchCompanionCard
          sessionId={session._id}
          startedAt={session.startedAt}
        />
        {aiAvailable ? (
          <Button
            label="Edit workout with AI"
            variant="outline"
            icon={Sparkles}
            onPress={() => setAiOpen(true)}
          />
        ) : null}
        {!session.exercises.length ? (
          <EmptyState
            title="No exercises yet"
            description={
              aiAvailable
                ? usesApple
                  ? "Add lifts as you go, or describe the session with on-device AI."
                  : "Add lifts as you go, or describe the session with AI."
                : "Add lifts as you go to build this session."
            }
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
                  <Pressable
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                    hitSlop={7}
                    accessibilityRole="button"
                    accessibilityState={{
                      expanded: !collapsed[exercise._id],
                    }}
                    onPress={() => toggleCollapsed(exercise._id)}
                  >
                    {collapsed[exercise._id] ? (
                      <ChevronRight size={18} color={colors.dim} />
                    ) : (
                      <ChevronDown size={18} color={colors.dim} />
                    )}
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
                        style={{
                          color: colors.dim,
                          fontSize: 11,
                          marginTop: 3,
                        }}
                      >
                        {exercise.sets.filter((set) => set.completed).length}/
                        {exercise.sets.length} sets complete ·{" "}
                        {exercise.restSeconds}s rest
                      </Text>
                    </View>
                  </Pressable>
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
                {collapsed[exercise._id] ? null : (
                  <NoteField
                    initial={exercise.notes ?? ""}
                    onSave={(notes) => saveNote(exercise.slug, notes)}
                  />
                )}
              </View>
              {collapsed[exercise._id] ? null : (
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
              )}
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
      {aiAvailable ? (
        <AiPromptModal
          visible={aiOpen}
          title="Reshape this workout"
          description={
            usesApple
              ? "Runs on this iPhone — nothing is sent to Workout’s servers. You’ll review the draft before it changes the session."
              : "Ask for additions, removals, or a new direction. You’ll review the exact draft before it changes the session."
          }
          loadingLabel="Reshaping your session…"
          onDevice={usesApple}
          onClose={() => setAiOpen(false)}
          onGenerate={generate}
        />
      ) : null}
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
  const rest = useRestTimer({
    notificationsEnabled: user.restTimerNotificationsEnabled,
  });
  const { updateSet } = useLocalData();
  const { aiAvailable, usesApple, aiOpen, setAiOpen, generate } =
    useSessionAi(session);
  const [drafts, setDrafts] = useState<
    Record<string, { weight: string; reps: string }>
  >({});
  const [plates, setPlates] = useState(false);
  const last = useLocalLastSet(item?.exercise.slug);
  const aiModal = aiAvailable ? (
    <AiPromptModal
      visible={aiOpen}
      title={item ? "Reshape this workout" : "Describe this workout"}
      description={
        usesApple
          ? "Runs on this iPhone — nothing is sent to Workout’s servers. You’ll review the draft before it changes the session."
          : "Ask for additions, removals, or a new direction. You’ll review the exact draft before it changes the session."
      }
      loadingLabel="Reshaping your session…"
      onDevice={usesApple}
      onClose={() => setAiOpen(false)}
      onGenerate={generate}
    />
  ) : null;

  if (!item) {
    return (
      <>
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
          <WatchCompanionCard
            sessionId={session._id}
            startedAt={session.startedAt}
          />
          {aiAvailable ? (
            <Button
              label="Describe with AI"
              variant="outline"
              icon={Sparkles}
              onPress={() => setAiOpen(true)}
            />
          ) : null}
          <EmptyState
            title="No sets yet"
            description={
              aiAvailable
                ? usesApple
                  ? "Describe the session with on-device AI, or switch to List in Settings to add lifts by hand."
                  : "Describe the session with AI, or switch to List in Settings to add lifts by hand."
                : "Switch to List mode in Settings to add exercises and sets."
            }
          />
        </Screen>
        {aiModal}
      </>
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
        <WatchCompanionCard
          sessionId={session._id}
          startedAt={session.startedAt}
        />
        {aiAvailable ? (
          <Button
            label="Edit workout with AI"
            variant="outline"
            icon={Sparkles}
            onPress={() => setAiOpen(true)}
          />
        ) : null}
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
      {aiModal}
    </>
  );
}

async function finishWorkout(session: WorkoutSession) {
  // The hook-based mutations live in a tiny component mounted by this helper's caller.
  finishController?.(session);
}

let finishController: ((session: WorkoutSession) => void) | null = null;

/** Matches the web finish flow's default: "Mar 4, 2026". */
function defaultTemplateName() {
  return new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Replaces the workout screen with its recap, so Back doesn't reopen the log. */
function showRecap(sessionId: string) {
  router.replace({
    pathname: "/workout/recap/[sessionId]",
    params: { sessionId },
  });
}

export function WorkoutFinishController() {
  const {
    finish,
    abandon,
    saveTemplateFromSession,
    updateTemplateFromSession,
    templateNeedsUpdate,
  } = useLocalData();
  const [savePrompt, setSavePrompt] = useState<{ sessionId: string } | null>(
    null,
  );
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Navigating while the sheet is still on screen tears it down mid-dismissal,
  // so the recap waits for `onDismiss` (iOS fires it once the sheet is gone).
  const [recapAfterSave, setRecapAfterSave] = useState<string | null>(null);

  function closeSavePrompt() {
    if (!savePrompt) return;
    if (Platform.OS === "ios") setRecapAfterSave(savePrompt.sessionId);
    setSavePrompt(null);
    if (Platform.OS !== "ios") showRecap(savePrompt.sessionId);
  }

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
                  router.replace("/dashboard"),
                ),
            },
          ],
        );
        return;
      }

      const commit = async () => {
        // Read the drift before finishing, while the template is still the one
        // the session was started from.
        const willPromptSync = session.templateId
          ? await templateNeedsUpdate(session._id)
          : false;
        await finish(session._id);
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );

        // Quick start: offer to keep it. Template-based: offer to write today's
        // numbers back, but only when they actually differ. Either way the
        // recap comes after the prompt, matching the web finish flow.
        if (!session.templateId) {
          setTemplateName(defaultTemplateName());
          setSaveError(null);
          setSavePrompt({ sessionId: session._id });
          return;
        }
        if (willPromptSync) promptUpdateTemplate(session);
        else showRecap(session._id);
      };

      const promptUpdateTemplate = (finished: WorkoutSession) => {
        Alert.alert(
          "Update template?",
          `Update ${finished.templateName} to match the exercises, order, and weights you just logged?`,
          [
            {
              text: "Keep as is",
              style: "cancel",
              onPress: () => showRecap(finished._id),
            },
            {
              text: "Update template",
              onPress: () =>
                void updateTemplateFromSession(finished._id)
                  .catch(() =>
                    Alert.alert(
                      "Couldn’t update template",
                      "Your workout was still saved.",
                    ),
                  )
                  .then(() => showRecap(finished._id)),
            },
          ],
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
                router.replace("/dashboard"),
              ),
          },
          { text: "Save workout", onPress: () => void commit() },
        ]);
      } else void commit();
    };
    return () => {
      finishController = null;
    };
  }, [
    abandon,
    finish,
    saveTemplateFromSession,
    templateNeedsUpdate,
    updateTemplateFromSession,
  ]);

  async function confirmSaveTemplate() {
    if (!savePrompt || savingTemplate) return;
    const name = templateName.trim();
    if (!name) {
      setSaveError("Give your template a name.");
      return;
    }
    setSavingTemplate(true);
    setSaveError(null);
    try {
      await saveTemplateFromSession(savePrompt.sessionId, name);
    } catch (cause) {
      setSavingTemplate(false);
      setSaveError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Couldn’t save template. Your workout was still saved.",
      );
      return;
    }
    setSavingTemplate(false);
    closeSavePrompt();
  }

  return (
    <Modal
      visible={savePrompt !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!savingTemplate) closeSavePrompt();
      }}
      onDismiss={() => {
        if (!recapAfterSave) return;
        showRecap(recapAfterSave);
        setRecapAfterSave(null);
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 18 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}
            >
              Save as template?
            </Text>
            <Text style={{ color: colors.dim, fontSize: 14, lineHeight: 20 }}>
              Keep this workout so you can start it again next time.
            </Text>
            <Field
              label="Template name"
              value={templateName}
              onChangeText={(value) => {
                setTemplateName(value);
                if (saveError) setSaveError(null);
              }}
              placeholder="e.g. Push day"
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={80}
              onSubmitEditing={() => void confirmSaveTemplate()}
            />
            {saveError ? (
              <Text
                style={{ color: colors.danger, fontSize: 13, lineHeight: 18 }}
              >
                {saveError}
              </Text>
            ) : null}
          </ScrollView>
          <View
            style={{
              gap: 9,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 12,
              borderTopWidth: 1,
              borderTopColor: colors.line,
              backgroundColor: colors.bg,
            }}
          >
            <Button
              label={savingTemplate ? "Saving…" : "Save template"}
              size="lg"
              disabled={savingTemplate || !templateName.trim()}
              onPress={confirmSaveTemplate}
            />
            <Button
              label="No thanks"
              variant="outline"
              disabled={savingTemplate}
              onPress={closeSavePrompt}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/** Read-only row in a past workout, mirroring the live `SetRow` columns. */
function CompletedSetRow({
  set,
  index,
  unit,
}: {
  set: PastWorkout["exercises"][number]["sets"][number];
  index: number;
  unit: string;
}) {
  const dim = !set.completed;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text
        style={{
          color: dim ? colors.faint : colors.dim,
          fontSize: 12,
          width: 35,
          textAlign: "center",
        }}
      >
        {index + 1}
      </Text>
      <Text
        style={{
          color: dim ? colors.faint : colors.text,
          fontSize: 15,
          fontWeight: "600",
          flex: 1,
        }}
      >
        {set.weight > 0 ? `${set.weight} ${unit}` : "—"}
      </Text>
      <Text
        style={{
          color: dim ? colors.faint : colors.text,
          fontSize: 15,
          fontWeight: "600",
          flex: 1,
        }}
      >
        {set.reps > 0 ? `${set.reps} reps` : "—"}
      </Text>
      <View style={{ width: 44, alignItems: "center" }}>
        {set.completed ? (
          <Check size={17} color={colors.success} />
        ) : (
          <Text style={{ color: colors.faint, fontSize: 11 }}>skipped</Text>
        )}
      </View>
    </View>
  );
}

/**
 * A finished (or abandoned) session, read-only. Same beats as the web log view
 * in its non-editable state: recap link, session totals, then the exercises as
 * they were logged.
 */
function CompletedWorkout({
  session,
  canDelete,
}: {
  session: PastWorkout;
  canDelete: boolean;
}) {
  const catalog = useCatalog();
  const { deleteSession } = useLocalData();
  const user = useLocalPreferences();
  // Cards start expanded, and each one toggles independently, matching the
  // live view.
  const [collapsed, setCollapsed] = useState<Record<string, true>>({});

  const totalSets = session.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.length,
    0,
  );
  const doneSets = session.exercises.reduce(
    (sum, exercise) =>
      sum + exercise.sets.filter((set) => set.completed).length,
    0,
  );
  const volume = session.exercises.reduce(
    (sum, exercise) =>
      sum +
      exercise.sets.reduce(
        (setSum, set) =>
          set.completed ? setSum + set.weight * set.reps : setSum,
        0,
      ),
    0,
  );
  const endedAt = session.completedAt ?? session.startedAt;
  const isCompleted = session.status === "completed";
  const unit = user?.unit ?? "lb";
  const isHealthSummary = session.sessionKind === "health_summary";
  const sourceName = session.health?.sourceName ?? session.sourceName ?? null;
  const durationSeconds =
    session.health?.durationSeconds ?? session.durationSeconds ?? null;
  const energyKcal = session.health?.energyKcal ?? session.energyKcal ?? null;
  const distanceMeters =
    session.health?.distanceMeters ?? session.distanceMeters ?? null;
  const durationMs =
    durationSeconds != null
      ? durationSeconds * 1000
      : Math.max(0, Math.floor((endedAt - session.startedAt) / 1000) * 1000);
  const healthFacts = [
    formatDuration(durationMs),
    formatHealthDistance(distanceMeters, unit),
    formatHealthEnergy(energyKcal),
    sourceName,
  ]
    .filter(Boolean)
    .join(" · ");

  function toggleCollapsed(exerciseId: string) {
    void Haptics.selectionAsync();
    setCollapsed((current) => {
      const next = { ...current };
      if (next[exerciseId]) delete next[exerciseId];
      else next[exerciseId] = true;
      return next;
    });
  }

  return (
    <Screen>
      <PageHeader
        back
        title={session.templateName}
        subtitle={`${formatDate(endedAt)} · ${new Date(
          endedAt,
        ).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}`}
        action={
          isCompleted ? (
            <Button
              size="sm"
              variant="outline"
              label="View recap"
              onPress={() =>
                router.push({
                  pathname: "/workout/recap/[sessionId]",
                  params: { sessionId: session._id },
                })
              }
            />
          ) : undefined
        }
      />

      <Card style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.dim,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.5,
              }}
            >
              SESSION
            </Text>
            <Text style={{ color: colors.dim, fontSize: 12, marginTop: 4 }}>
              This workout is {isCompleted ? "complete" : "no longer active"}.
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatClock(
                Math.max(0, Math.floor((endedAt - session.startedAt) / 1000)),
              )}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 11, marginTop: 2 }}>
              {isHealthSummary
                ? healthFacts || "Imported from Apple Health"
                : `${doneSets}/${totalSets} sets · ${formatWeight(volume, unit)} moved`}
            </Text>
          </View>
        </View>
        <View
          style={{
            height: 6,
            borderRadius: 3,
            overflow: "hidden",
            backgroundColor: colors.surface2,
          }}
        >
          <View
            style={{
              height: "100%",
              borderRadius: 3,
              backgroundColor: colors.success,
              width: `${
                isHealthSummary
                  ? 100
                  : totalSets
                    ? (doneSets / totalSets) * 100
                    : 0
              }%`,
            }}
          />
        </View>
        {isHealthSummary ? (
          <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 18 }}>
            Imported from Apple Health. This copy does not include lifts, sets,
            or volume.
          </Text>
        ) : null}
      </Card>

      {isHealthSummary ? (
        <Card>
          <Text
            style={{
              color: colors.dim,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.5,
            }}
          >
            APPLE HEALTH
          </Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
            {session.templateName}
          </Text>
          <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
            {healthFacts || "Summary imported from Apple Health."}
          </Text>
        </Card>
      ) : session.exercises.length ? (
        session.exercises.map((exercise) => {
          const exerciseDone = exercise.sets.filter(
            (set) => set.completed,
          ).length;
          const isCollapsed = Boolean(collapsed[exercise._id]);
          return (
            <Card
              key={exercise._id}
              style={{ padding: 0, overflow: "hidden", gap: 0 }}
            >
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  padding: 14,
                }}
                hitSlop={7}
                accessibilityRole="button"
                accessibilityState={{ expanded: !isCollapsed }}
                onPress={() => toggleCollapsed(exercise._id)}
              >
                {isCollapsed ? (
                  <ChevronRight size={18} color={colors.dim} />
                ) : (
                  <ChevronDown size={18} color={colors.dim} />
                )}
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
                    {exerciseDone}/{exercise.sets.length} sets complete
                  </Text>
                </View>
              </Pressable>
              {isCollapsed ? null : (
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                    padding: 12,
                    gap: 9,
                  }}
                >
                  {exercise.notes ? (
                    <Text
                      style={{
                        color: colors.dim,
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      {exercise.notes}
                    </Text>
                  ) : null}
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
                    <CompletedSetRow
                      key={set._id}
                      set={set}
                      index={setIndex}
                      unit={unit}
                    />
                  ))}
                </View>
              )}
            </Card>
          );
        })
      ) : (
        <EmptyState
          title="No exercises logged"
          description="This workout finished without any lifts."
        />
      )}

      <Button label="Done" onPress={() => router.replace("/dashboard")} />
      {canDelete ? (
        <Button
          label={isHealthSummary ? "Remove from Workout" : "Delete workout"}
          variant="ghost"
          icon={Trash2}
          onPress={() =>
            Alert.alert(
              isHealthSummary ? "Remove from Workout?" : "Delete this workout?",
              isHealthSummary
                ? "The original workout stays in Apple Health. Only this copy in Workout is removed."
                : "This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: isHealthSummary ? "Remove" : "Delete",
                  style: "destructive",
                  onPress: () =>
                    void deleteSession(session._id).then(() =>
                      router.replace("/insights"),
                    ),
                },
              ],
            )
          }
        />
      ) : null}
    </Screen>
  );
}
