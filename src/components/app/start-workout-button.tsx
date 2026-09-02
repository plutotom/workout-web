"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Play, Zap } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { PlaceChip, PlacePickerSheet } from "@/components/app/place-picker";
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
  const startContext = useQuery(api.routes.places.queries.startContext, {
    templateId,
  });
  const start = useMutation(api.routes.workouts.mutations.start);
  const startBlank = useMutation(api.routes.workouts.mutations.startBlank);

  const [conflictOpen, setConflictOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeId, setPlaceId] = useState<Id<"places"> | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedPlaceId = placeId ?? startContext?.selectedPlaceId ?? null;
  const selectedPlace =
    startContext?.places.find((place) => place._id === selectedPlaceId) ?? null;

  async function begin(abandonExisting?: boolean) {
    setBusy(true);
    try {
      const sessionId = isBlank
        ? await startBlank({
            abandonExisting,
            placeId: selectedPlaceId ?? undefined,
          })
        : await start({
            templateId: templateId!,
            abandonExisting,
            placeId: selectedPlaceId ?? undefined,
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
      <div className="flex w-full flex-col gap-2">
        <PlaceChip
          name={selectedPlace?.name ?? null}
          lastPlaceName={startContext?.lastPlaceName}
          disabled={startContext === undefined}
          onClick={() => setPlaceOpen(true)}
        />
        <Button
          className={className}
          variant={variant}
          disabled={active === undefined || busy}
          onClick={handleClick}
        >
          <Icon className="size-4" />
          {buttonLabel}
        </Button>
      </div>

      <PlacePickerSheet
        open={placeOpen}
        onOpenChange={setPlaceOpen}
        places={startContext?.places ?? []}
        selectedPlaceId={selectedPlaceId}
        lastPlaceId={startContext?.lastPlaceId}
        onSelect={(id) => {
          setPlaceId(id);
        }}
      />

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
