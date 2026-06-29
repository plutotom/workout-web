"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/api";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ExerciseNoteField({
  exerciseSlug,
  initialNotes,
  editable = true,
}: {
  exerciseSlug: string;
  initialNotes?: string;
  editable?: boolean;
}) {
  const upsertNote = useMutation(api.routes.exercises.mutations.upsertNote);
  const [value, setValue] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    const trimmed = value.trim();
    const initial = (initialNotes ?? "").trim();
    if (trimmed === initial || saving) return;

    setSaving(true);
    try {
      await upsertNote({ exerciseSlug, notes: value });
    } catch {
      setValue(initialNotes ?? "");
      toast.error("Couldn't save note");
    } finally {
      setSaving(false);
    }
  }

  if (!editable && !value.trim()) return null;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`note-${exerciseSlug}`} className="text-muted-foreground">
        Note
      </Label>
      <Textarea
        id={`note-${exerciseSlug}`}
        value={value}
        placeholder="What is this exercise? Add cues for next time."
        disabled={!editable || saving}
        rows={2}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
      />
    </div>
  );
}
