"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function DeleteWorkoutButton({
  sessionId,
  onDeleted,
  variant = "button",
  className,
}: {
  sessionId: Id<"workoutSessions">;
  onDeleted?: () => void;
  variant?: "button" | "icon";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteSession = useMutation(
    api.routes.workouts.mutations.deleteSession,
  );

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteSession({ sessionId });
      toast.success("Workout deleted");
      setOpen(false);
      onDeleted?.();
    } catch {
      setDeleting(false);
      toast.error("Couldn't delete workout");
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            "text-muted-foreground hover:text-destructive size-9 shrink-0",
            className,
          )}
          aria-label="Delete workout"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className={cn(
            "text-destructive hover:text-destructive w-full",
            className,
          )}
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-4" />
          Delete workout
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this workout?</DialogTitle>
            <DialogDescription>
              This permanently removes the session from your history and
              insights. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
