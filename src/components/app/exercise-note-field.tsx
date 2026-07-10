"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_NOTE_LENGTH = 500;

export function ExerciseNoteField({
  exerciseSlug,
  initialNotes,
  editable = true,
  compact = false,
  hideEmptyPrompt = false,
  openSignal = 0,
}: {
  exerciseSlug: string;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initial = (initialNotes ?? "").trim();
  const [value, setValue] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(
    () => !compact || initial.length > 0,
  );
  const [focusToken, setFocusToken] = useState(0);
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

  async function commit() {
    if (trimmed === initial || saving) return;

    setSaving(true);
    try {
      await upsertNote({ exerciseSlug, notes: value });
      if (compact && !trimmed) setExpanded(false);
    } catch {
      setValue(initialNotes ?? "");
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

  if (!editable && !hasNote) return null;

  if (!expanded) {
    if (hasNote) {
      return (
        <button
          type="button"
          disabled={!editable}
          onClick={() => editable && openEditor()}
          className={cn(
            "w-full rounded-md border px-3 py-2 text-left text-sm whitespace-pre-wrap",
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
    <Textarea
      ref={textareaRef}
      id={`note-${exerciseSlug}`}
      value={value}
      maxLength={MAX_NOTE_LENGTH}
      placeholder="What is this exercise? Add cues for next time."
      disabled={!editable || saving}
      rows={2}
      aria-label="Exercise note"
      className="min-h-0"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        void commit();
        if (compact) setExpanded(false);
      }}
    />
  );
}
