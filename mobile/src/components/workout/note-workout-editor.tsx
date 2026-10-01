import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  AppState,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyboardStickyFooter } from "@/components/keyboard-sticky-footer";
import { Button, PageHeader } from "@/components/ui";
import { useLocalData } from "@/data/local/provider";
import type { LocalWorkoutSession } from "@/data/local/types";
import { WatchCompanionCard } from "@/health/watch-companion-card";
import { colors } from "@/theme";
import { MAX_WORKOUT_NOTE_LENGTH } from "@shared/note-workouts";

export function WorkoutNoteField({
  text,
  onChangeText,
  editable = true,
  onBlur,
}: {
  text: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
  onBlur?: () => void;
}) {
  return (
    <>
      <TextInput
        accessibilityLabel="Workout note"
        value={text}
        onChangeText={onChangeText}
        onBlur={onBlur}
        editable={editable}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        placeholder={
          "Write your workout however you like.\n\nBench 10 @ 150, 10 @ 150, 6 @ 160\nPull up 10, 9, 9"
        }
        placeholderTextColor={colors.faint}
        selectionColor={colors.text}
        style={{
          color: colors.text,
          fontSize: 18,
          lineHeight: 29,
          minHeight: 260,
          paddingVertical: 12,
          paddingHorizontal: 0,
        }}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color:
            text.length > MAX_WORKOUT_NOTE_LENGTH
              ? colors.danger
              : colors.faint,
          fontSize: 12,
          textAlign: "right",
        }}
      >
        {text.length.toLocaleString()} /{" "}
        {MAX_WORKOUT_NOTE_LENGTH.toLocaleString()} characters
      </Text>
    </>
  );
}

export function NoteWorkoutEditor({
  session,
  subtitle,
  placeControls,
}: {
  session: LocalWorkoutSession;
  subtitle: ReactNode;
  placeControls: ReactNode;
}) {
  const actions = useLocalData();
  const actionRef = useRef(actions);
  useEffect(() => {
    actionRef.current = actions;
  }, [actions]);
  const [text, setText] = useState(session.noteBody ?? "");
  const [savedText, setSavedText] = useState(session.noteBody ?? "");
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(text);
  const saved = useRef(session.noteBody ?? "");
  const paused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());

  const cancelDebounce = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const flush = useCallback(() => {
    cancelDebounce();
    const draft = latest.current;
    if (paused.current || draft.length > MAX_WORKOUT_NOTE_LENGTH)
      return writes.current;
    const write = writes.current.then(async () => {
      if (paused.current || draft === saved.current) return;
      setSaving(true);
      try {
        await actionRef.current.saveWorkoutNote(
          session._id,
          draft,
          "in_progress",
        );
        saved.current = draft;
        setSavedText(draft);
        setError(null);
      } finally {
        setSaving(false);
      }
    });
    // Keep the queue usable after a failed save, retaining the draft for retry.
    writes.current = write.catch((caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : "Couldn’t save your note. Try again.",
      );
    });
    return writes.current;
  }, [cancelDebounce, session._id]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flush();
    });
    return () => subscription.remove();
  }, [flush]);

  useFocusEffect(
    useCallback(
      () => () => {
        void flush();
      },
      [flush],
    ),
  );

  function changeText(next: string) {
    latest.current = next;
    setText(next);
    cancelDebounce();
    setError(
      next.length > MAX_WORKOUT_NOTE_LENGTH
        ? "Your note is over the limit. Shorten it to save; your text has not been cut."
        : null,
    );
    timer.current = setTimeout(() => {
      void flush();
    }, 500);
  }

  async function discard() {
    paused.current = true;
    cancelDebounce();
    setFinishing(true);
    await writes.current;
    try {
      await actionRef.current.abandon(session._id);
      router.replace("/dashboard");
    } catch (caught) {
      paused.current = false;
      setFinishing(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Couldn’t discard workout. Try again.",
      );
    }
  }

  async function finish() {
    if (paused.current || latest.current.length > MAX_WORKOUT_NOTE_LENGTH)
      return;
    if (!latest.current.trim()) {
      Alert.alert(
        "Discard this workout?",
        "Your note is empty. Add a note to save this workout.",
        [
          { text: "Keep training", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              void discard();
            },
          },
        ],
      );
      return;
    }
    paused.current = true;
    cancelDebounce();
    setFinishing(true);
    setError(null);
    await writes.current;
    try {
      await actionRef.current.finishNote(session._id, latest.current);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/workout/recap/[sessionId]",
        params: { sessionId: session._id },
      });
    } catch (caught) {
      paused.current = false;
      setFinishing(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Couldn’t finish workout. Your note is still here.",
      );
    }
  }

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 18, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <PageHeader title="Note workout" back subtitle={subtitle} />
        {placeControls}
        <WatchCompanionCard
          sessionId={session._id}
          startedAt={session.startedAt}
        />
        <WorkoutNoteField
          text={text}
          onChangeText={changeText}
          onBlur={() => {
            void flush();
          }}
          editable={!finishing}
        />
        {error ? (
          <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <KeyboardStickyFooter
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={{ color: colors.dim, fontSize: 12 }}>
            {saving
              ? "Saving…"
              : error
                ? "Note needs attention"
                : text === savedText
                  ? "Saved on this device"
                  : "Saving…"}
          </Text>
          <Text style={{ color: colors.faint, fontSize: 12 }}>
            Counts toward attendance
          </Text>
        </View>
        <Button
          label={finishing ? "Finishing…" : "Finish workout"}
          size="lg"
          disabled={finishing || text.length > MAX_WORKOUT_NOTE_LENGTH}
          onPress={finish}
        />
      </KeyboardStickyFooter>
    </SafeAreaView>
  );
}
