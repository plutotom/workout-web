import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { Field } from "@/components/ui";
import { colors } from "@/theme";
import { usePersistedDraft } from "@/hooks/use-persisted-draft";
import {
  exerciseNoteLengthHint,
  MAX_EXERCISE_NOTE_LENGTH,
  normalizeExerciseNote,
} from "@shared/exercise-notes";

export function ExerciseNoteEditor({
  initial,
  onSave,
  placeholder = "Exercise note",
}: {
  initial: string;
  onSave: (notes: string) => Promise<unknown>;
  placeholder?: string;
}) {
  const draft = usePersistedDraft(initial);
  const [error, setError] = useState<string | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const saveSequence = useRef(0);
  const value = draft.value;
  const overLimit = value.length > MAX_EXERCISE_NOTE_LENGTH;
  const hint = exerciseNoteLengthHint(value) ?? error;

  async function commit() {
    if (overLimit || !draft.dirty) return;
    const note = normalizeExerciseNote(value);
    const acknowledge = draft.prepareSave(note);
    const sequence = ++saveSequence.current;
    const write = writes.current.catch(() => {}).then(() => onSave(note));
    writes.current = write;
    try {
      await write;
      acknowledge.acknowledge();
      if (sequence === saveSequence.current) {
        setError(null);
      }
    } catch (caught) {
      acknowledge.reject();
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
          draft.change(next);
          setError(null);
        }}
        onBlur={() => void commit()}
        placeholder={placeholder}
        multiline
        autoGrow
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
