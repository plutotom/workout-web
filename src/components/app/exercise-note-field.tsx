"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  exerciseNoteLengthHint,
  MAX_EXERCISE_NOTE_LENGTH,
  sizeExerciseNoteTextarea,
} from "@/lib/exercise-notes";

export function ExerciseNoteField({
  exerciseSlug,
  sessionExerciseId,
  initialNotes,
  editable = true,
  compact = false,
  hideEmptyPrompt = false,
  openSignal = 0,
}: {
  exerciseSlug: string;
  /** When set, the note is saved onto this session lift instead of the global cue. */
  sessionExerciseId?: Id<"sessionExercises">;
  initialNotes?: string;
  editable?: boolean;
  /** When true, hide the empty textarea until the user opts in. */
  compact?: boolean;
  /** When true, don't render the empty "Add note" button (open via openSignal). */
  hideEmptyPrompt?: boolean;
  /** Increment to open/focus the note editor from a parent menu. */
  openSignal?: number;
}) {
  const upsertNote = useMutation(api.routes.exercises.mutations.upsertNote);
  const updateSessionNotes = useMutation(
    api.routes.workouts.mutations.updateExerciseNotes,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initial = (initialNotes ?? "").trim();
  const [value, setValue] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(
    () => !compact || initial.length > 0,
  );
  const [focusToken, setFocusToken] = useState(0);
  const [focused, setFocused] = useState(false);
  const [prevOpenSignal, setPrevOpenSignal] = useState(openSignal);

  if (openSignal !== prevOpenSignal) {
    setPrevOpenSignal(openSignal);
    if (editable && openSignal !== 0) {
      setExpanded(true);
      setFocusToken((token) => token + 1);
    }
  }

  const trimmed = value.trim();
  const hasNote = trimmed.length > 0;
  const overLimit = value.length > MAX_EXERCISE_NOTE_LENGTH;
  const hint = exerciseNoteLengthHint(value);

  async function commit() {
    if (trimmed === initial || saving || overLimit) return;

    setSaving(true);
    try {
      if (sessionExerciseId) {
        await updateSessionNotes({ sessionExerciseId, notes: value });
      } else {
        await upsertNote({ exerciseSlug, notes: value });
      }
      if (compact && !trimmed) setExpanded(false);
    } catch {
      toast.error("Couldn't save note");
    } finally {
      setSaving(false);
    }
  }

  function openEditor() {
    setExpanded(true);
    setFocusToken((token) => token + 1);
  }

  useLayoutEffect(() => {
    if (!expanded || focusToken === 0) return;
    textareaRef.current?.focus();
  }, [expanded, focusToken]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const el = textareaRef.current;
    if (el) sizeExerciseNoteTextarea(el, focused);
  }, [expanded, focused, value]);

  if (!editable && !hasNote) return null;

  if (!expanded) {
    if (hasNote) {
      return (
        <button
          type="button"
          disabled={!editable}
          onClick={() => editable && openEditor()}
          className={cn(
            "w-full rounded-md border px-3 py-2 text-left text-sm break-words whitespace-pre-wrap",
            editable
              ? "bg-muted/40 hover:bg-muted/60 transition-colors"
              : "bg-muted/30 text-muted-foreground",
          )}
        >
          {trimmed}
        </button>
      );
    }

    if (!editable || hideEmptyPrompt) return null;

    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground h-8 self-start px-2"
        onClick={openEditor}
      >
        <StickyNote className="size-3.5" />
        Add note
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Textarea
        ref={textareaRef}
        id={`note-${exerciseSlug}`}
        value={value}
        placeholder="What is this exercise? Add cues for next time."
        disabled={!editable || saving}
        rows={1}
        aria-label="Exercise note"
        aria-invalid={overLimit || undefined}
        aria-describedby={hint ? `note-${exerciseSlug}-hint` : undefined}
        className="min-h-12 resize-none overflow-hidden break-words whitespace-pre-wrap [field-sizing:fixed]"
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          void commit();
          if (compact && !overLimit) setExpanded(false);
        }}
      />
      {hint ? (
        <p
          id={`note-${exerciseSlug}-hint`}
          role="status"
          className={cn(
            "text-xs",
            overLimit ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
