/** Shared by the web editor, iOS storage, imports, and Convex mutations. */
export const MAX_EXERCISE_NOTE_LENGTH = 10_000;
export const EXERCISE_NOTE_WARNING_LENGTH = 9_000;

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
