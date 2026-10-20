/** Shared by the web editor, iOS storage, imports, and Convex mutations. */
export const MAX_EXERCISE_NOTE_LENGTH = 10_000;
export const EXERCISE_NOTE_WARNING_LENGTH = 9_000;

/** Compact cue fields grow from one line; cap while focused, then scroll. */
export const EXERCISE_NOTE_INPUT_LINE_HEIGHT = 22;
export const EXERCISE_NOTE_INPUT_MAX_LINES = 8;
export const EXERCISE_NOTE_INPUT_VERTICAL_PADDING = 26;
export const EXERCISE_NOTE_INPUT_MAX_HEIGHT =
  EXERCISE_NOTE_INPUT_VERTICAL_PADDING +
  EXERCISE_NOTE_INPUT_LINE_HEIGHT * EXERCISE_NOTE_INPUT_MAX_LINES;

export function exerciseNoteFieldMaxHeight(
  focused: boolean,
): number | undefined {
  return focused ? EXERCISE_NOTE_INPUT_MAX_HEIGHT : undefined;
}

export function exerciseNoteFieldScrolls(
  focused: boolean,
  contentHeight: number,
): boolean {
  return (
    focused &&
    Number.isFinite(contentHeight) &&
    contentHeight > EXERCISE_NOTE_INPUT_MAX_HEIGHT
  );
}

/** Size a textarea to its text; cap and scroll only while the caret is in it. */
export function sizeExerciseNoteTextarea(
  el: {
    style: { height: string; overflowY: string };
    scrollHeight: number;
  },
  focused: boolean,
): void {
  el.style.height = "auto";
  const content = el.scrollHeight;
  const maxHeight = exerciseNoteFieldMaxHeight(focused);
  if (maxHeight != null && content > maxHeight) {
    el.style.height = `${maxHeight}px`;
    el.style.overflowY = "auto";
    return;
  }
  el.style.height = `${Math.max(content, 0)}px`;
  el.style.overflowY = "hidden";
}

export function normalizeExerciseNote(notes: string): string {
  if (notes.length > MAX_EXERCISE_NOTE_LENGTH) {
    throw new Error(
      `Exercise note must be at most ${MAX_EXERCISE_NOTE_LENGTH} characters`,
    );
  }
  return notes.trim();
}

/** Ordinary notes need no counter; show guidance only near or over the limit. */
export function exerciseNoteLengthHint(notes: string): string | null {
  if (notes.length < EXERCISE_NOTE_WARNING_LENGTH) return null;
  if (notes.length > MAX_EXERCISE_NOTE_LENGTH) {
    return "Your note is over 10,000 characters. Shorten it to save; your text has not been cut.";
  }
  return `${notes.length.toLocaleString()} / ${MAX_EXERCISE_NOTE_LENGTH.toLocaleString()} characters`;
}
