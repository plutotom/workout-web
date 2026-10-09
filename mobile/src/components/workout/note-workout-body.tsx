import { router } from "expo-router";
import { ListChecks, Pencil } from "lucide-react-native";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Alert, Keyboard, Modal, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useMobileAuth } from "@/auth/auth-provider";
import { useEntitlementState } from "@/hooks/use-entitlement";
import { KeyboardStickyFooter } from "@/components/keyboard-sticky-footer";
import { Button, Card } from "@/components/ui";
import { NoteConversionPreviewSheet } from "@/components/workout/note-conversion-preview";
import { WorkoutNoteField } from "@/components/workout/note-workout-editor";
import { useLocalData, useLocalPreferences } from "@/data/local/provider";
import type { NoteConversionPreview } from "@shared/note-conversion-preview";
import type { NoteUnit } from "@shared/note-workouts";
import { getLocalWorkout } from "@/data/local/repository";
import { colors } from "@/theme";
import { MAX_WORKOUT_NOTE_LENGTH } from "@shared/note-workouts";

/** Shared by the recap and the saved workout detail; notes stay plain text. */
export function NoteWorkoutBody({
  sessionId,
  noteBody,
  noteUnit,
  canEdit = true,
  original = false,
  prepareEdit,
}: {
  sessionId: string;
  noteBody: string | null | undefined;
  noteUnit?: "lb" | "kg" | null;
  canEdit?: boolean;
  original?: boolean;
  prepareEdit?: () => Promise<string>;
}) {
  const db = useSQLiteContext();
  const { convertWorkoutNote } = useLocalData();
  const preferences = useLocalPreferences();
  const { isAuthenticated } = useMobileAuth();
  const { entitlement, serverEntitlement } = useEntitlementState(
    !isAuthenticated || !canEdit,
  );
  const [editing, setEditing] = useState(false);
  const [editSessionId, setEditSessionId] = useState(sessionId);
  const [editText, setEditText] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<{
    noteBody: string;
    noteUnit?: "lb" | "kg" | null;
  } | null>(null);

  async function beginPreview() {
    if (preparing || editing || preview) return;
    if (!entitlement?.isPro) {
      Alert.alert(
        "Note conversion is part of Pro",
        "Review the lifts and sets in your workout notes with Pro.",
        [
          { text: "Maybe later", style: "cancel" },
          { text: "View Pro", onPress: () => router.push("/settings") },
        ],
      );
      return;
    }
    setPreparing(true);
    try {
      // Read an existing offline revision without adopting or writing anything.
      const local = await getLocalWorkout(db, sessionId);
      if (local && (local.status !== "completed" || local.inputMode !== "note"))
        throw new Error("This workout note is unavailable for conversion.");
      const text = local ? (local.noteBody ?? "") : (noteBody ?? "");
      if (!text.trim()) throw new Error("Add some workout text first.");
      if (text.length > MAX_WORKOUT_NOTE_LENGTH)
        throw new Error(
          "Shorten this note before opening the conversion preview.",
        );
      setPreview({
        noteBody: text,
        noteUnit: local ? local.noteUnit : noteUnit,
      });
    } catch (caught) {
      Alert.alert(
        "Couldn’t open preview",
        caught instanceof Error ? caught.message : "Try again.",
      );
    } finally {
      setPreparing(false);
    }
  }

  async function beginEdit() {
    if (preparing) return;
    setPreparing(true);
    try {
      const localId = prepareEdit ? await prepareEdit() : sessionId;
      // Adoption can find a newer offline revision; edit the actual local note.
      const local = await getLocalWorkout(db, localId);
      if (
        !local ||
        local.status !== "completed" ||
        local.inputMode !== "note"
      ) {
        throw new Error("This workout note is unavailable for editing.");
      }
      setEditSessionId(local._id);
      setEditText(local.noteBody ?? "");
      setEditing(true);
    } catch (caught) {
      Alert.alert(
        "Couldn’t open note",
        caught instanceof Error ? caught.message : "Try again.",
      );
    } finally {
      setPreparing(false);
    }
  }
  async function confirmConversion(
    draft: NoteConversionPreview,
    targetUnit: NoteUnit,
  ) {
    if (!entitlement?.isPro)
      throw new Error(
        "Note conversion requires Pro. Check your account and try again.",
      );
    if (!serverEntitlement?.isPro)
      throw new Error(
        "Saving requires active Pro access. Reconnect your account and try again.",
      );
    const localId = prepareEdit ? await prepareEdit() : sessionId;
    await convertWorkoutNote(localId, draft, targetUnit);
  }
  return (
    <>
      <Card style={{ gap: 16 }}>
        <Text
          style={{
            color: colors.dim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.5,
          }}
        >
          {original ? "ORIGINAL NOTE" : "WORKOUT NOTE"}
        </Text>
        <Text
          selectable
          style={{ color: colors.text, fontSize: 18, lineHeight: 29 }}
        >
          {noteBody || "No note saved."}
        </Text>
        {noteUnit ? (
          <Text style={{ color: colors.faint, fontSize: 12 }}>
            Written in {noteUnit}
          </Text>
        ) : null}
        {canEdit ? (
          <Button
            label={preparing ? "Opening…" : "Edit note"}
            variant="outline"
            icon={Pencil}
            disabled={preparing}
            onPress={beginEdit}
          />
        ) : null}
        {canEdit && noteBody?.trim() ? (
          <Button
            label={
              isAuthenticated && entitlement === undefined
                ? "Checking Pro…"
                : "Convert note · Pro"
            }
            variant="ghost"
            icon={ListChecks}
            disabled={
              preparing || (isAuthenticated && entitlement === undefined)
            }
            onPress={beginPreview}
          />
        ) : null}
      </Card>
      {editing ? (
        <EditWorkoutNote
          sessionId={editSessionId}
          initialText={editText}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {preview ? (
        <NoteConversionPreviewSheet
          noteBody={preview.noteBody}
          noteUnit={preview.noteUnit}
          targetUnit={preferences?.unit ?? "lb"}
          onConfirm={confirmConversion}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}

function EditWorkoutNote({
  sessionId,
  initialText,
  onClose,
}: {
  sessionId: string;
  initialText: string;
  onClose: () => void;
}) {
  const { saveWorkoutNote } = useLocalData();
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (saving) return;
    if (text !== initialText) {
      Alert.alert(
        "Discard note changes?",
        "Your saved workout note will stay as it was.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard changes", style: "destructive", onPress: onClose },
        ],
      );
    } else onClose();
  }

  async function save() {
    if (saving || !text.trim() || text.length > MAX_WORKOUT_NOTE_LENGTH) return;
    setSaving(true);
    setError(null);
    try {
      await saveWorkoutNote(sessionId, text, "completed");
      Keyboard.dismiss();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Couldn’t save your note. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView
        edges={["top"]}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}>
            Edit note
          </Text>
          <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
            Your workout date, duration, and Health record stay the same.
          </Text>
          <WorkoutNoteField
            text={text}
            editable={!saving}
            onChangeText={(next) => {
              setText(next);
              setError(null);
            }}
          />
          {text.length > MAX_WORKOUT_NOTE_LENGTH ? (
            <Text style={{ color: colors.danger, fontSize: 13 }}>
              Your note is over the limit. Shorten it to save; your text has not
              been cut.
            </Text>
          ) : null}
          {!text.trim() ? (
            <Text style={{ color: colors.dim, fontSize: 13 }}>
              Keep some text in your completed workout note.
            </Text>
          ) : null}
          {error ? (
            <Text
              style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}
            >
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <KeyboardStickyFooter
          style={{
            flexDirection: "row",
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 12,
            backgroundColor: colors.bg,
          }}
        >
          <Button
            label="Cancel"
            variant="outline"
            size="lg"
            disabled={saving}
            style={{ flex: 1 }}
            onPress={close}
          />
          <Button
            label={saving ? "Saving…" : "Save note"}
            size="lg"
            disabled={
              saving || !text.trim() || text.length > MAX_WORKOUT_NOTE_LENGTH
            }
            style={{ flex: 1 }}
            onPress={save}
          />
        </KeyboardStickyFooter>
      </SafeAreaView>
    </Modal>
  );
}
