import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { Field } from "@/components/ui";
import { colors } from "@/theme";
import {
  exerciseNoteLengthHint,
  MAX_EXERCISE_NOTE_LENGTH,
  normalizeExerciseNote,
} from "@shared/exercise-notes";

export function ExerciseNoteEditor({
  initial,
  onSave,
  multiline = true,
  placeholder = "Exercise note",
}: {
  initial: string;
  onSave: (notes: string) => Promise<unknown>;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [content, setContent] = useState({ initial, value: initial });
  const [error, setError] = useState<string | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const saveSequence = useRef(0);
  // A local read may finish after save returns. Keep the draft until that read
  // catches up; new cloud values can refresh an editor without unsaved edits.
  if (content.initial !== initial) {
    setContent({
      initial,
      value: content.value === content.initial ? initial : content.value,
    });
  }

  const value = content.value;
  const overLimit = value.length > MAX_EXERCISE_NOTE_LENGTH;
  const hint = exerciseNoteLengthHint(value) ?? error;

  async function commit() {
    if (overLimit || value === initial) return;
    const note = normalizeExerciseNote(value);
    const sequence = ++saveSequence.current;
    const write = writes.current.catch(() => {}).then(() => onSave(note));
    writes.current = write;
    try {
      await write;
      if (sequence === saveSequence.current) {
        setError(null);
        setContent((current) =>
          current.value === value ? { ...current, value: note } : current,
        );
      }
    } catch (caught) {
      if (sequence === saveSequence.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Couldn’t save your note. Try again.",
        );
      }
    }
  }

  return (
    <View style={{ gap: 7 }}>
      <Field
        accessibilityLabel="Exercise note"
        value={value}
        onChangeText={(next) => {
          setContent((current) => ({ ...current, value: next }));
          setError(null);
        }}
        onBlur={() => void commit()}
        placeholder={placeholder}
        multiline={multiline}
      />
      {hint ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: overLimit || error ? colors.danger : colors.dim,
            fontSize: 12,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
