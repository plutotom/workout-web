"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Play, Zap } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type StartWorkoutButtonProps =
  | {
      mode?: "template";
      templateId: Id<"workoutTemplates">;
      variant?: "default" | "outline" | "ghost" | "secondary";
      label?: string;
      className?: string;
    }
  | {
      mode: "blank";
      templateId?: never;
      variant?: "default" | "outline" | "ghost" | "secondary";
      label?: string;
      className?: string;
    };

export function StartWorkoutButton(props: StartWorkoutButtonProps) {
  const {
    mode = "template",
    variant = "default",
    label,
    className = "w-full",
  } = props;
  const isBlank = mode === "blank";
  const templateId = !isBlank ? props.templateId : undefined;

  const router = useRouter();
  const active = useQuery(api.routes.workouts.queries.active);
  const start = useMutation(api.routes.workouts.mutations.start);
  const startBlank = useMutation(api.routes.workouts.mutations.startBlank);

  const [conflictOpen, setConflictOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function begin(abandonExisting?: boolean) {
    setBusy(true);
    try {
      const sessionId = isBlank
        ? await startBlank({ abandonExisting })
        : await start({
            templateId: templateId!,
            abandonExisting,
          });
      router.push(`/workout/${sessionId}`);
    } catch {
      setBusy(false);
      setConflictOpen(false);
      toast.error("Couldn't start workout");
    }
  }

  function handleClick() {
    if (active) {
      setConflictOpen(true);
      return;
    }
    void begin();
  }

  const buttonLabel = label ?? (isBlank ? "Quick start" : "Start workout");
  const Icon = isBlank ? Zap : Play;

  return (
    <>
      <Button
        className={className}
        variant={variant}
        disabled={active === undefined || busy}
        onClick={handleClick}
      >
        <Icon className="size-4" />
        {buttonLabel}
      </Button>

      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workout in progress</DialogTitle>
            <DialogDescription>
              You&apos;re in the middle of {active?.templateName ?? "a workout"}
              . Resume it, or abandon it and start this one?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button
              onClick={() => {
                if (active) router.push(`/workout/${active._id}`);
              }}
            >
              Resume current
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void begin(true)}
            >
              Abandon &amp; start new
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
