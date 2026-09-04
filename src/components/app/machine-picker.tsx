"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Check, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useVisualViewportFrame } from "@/hooks/use-visual-viewport-frame";
import { cn } from "@/lib/utils";

export function MachineChip({
  placeName,
  machineName,
  onClick,
  disabled,
}: {
  placeName: string | null;
  machineName: string | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  const label = machineName
    ? `${placeName ?? "Place"} · ${machineName}`
    : (placeName ?? "Place");
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className="text-muted-foreground mt-0.5 text-left text-xs font-medium underline-offset-2 hover:underline disabled:no-underline"
    >
      {label}
    </button>
  );
}

export function MachinePickerSheet({
  open,
  onOpenChange,
  placeId,
  exerciseSlug,
  sessionExerciseId,
  selectedMachineId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeId: Id<"places"> | null;
  exerciseSlug: string;
  sessionExerciseId: Id<"sessionExercises">;
  selectedMachineId: Id<"machines"> | null;
}) {
  const machines = useQuery(
    api.routes.places.queries.machinesForLift,
    placeId && open ? { placeId, exerciseSlug } : "skip",
  );
  const setMachine = useMutation(api.routes.places.mutations.setSessionMachine);
  const createMachine = useMutation(api.routes.places.mutations.createMachine);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const { style } = useVisualViewportFrame(open, { mode: "dock" });

  async function pick(machineId: Id<"machines">) {
    try {
      await setMachine({ sessionExerciseId, machineId });
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't switch machine",
      );
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Give this machine a name");
      return;
    }
    setSaving(true);
    try {
      await createMachine({ sessionExerciseId, name });
      setNewName("");
      setAdding(false);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't add machine",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        style={style}
        className="flex max-h-[85dvh] flex-col rounded-t-2xl"
      >
        <SheetHeader className="shrink-0">
          <SheetTitle>Which machine?</SheetTitle>
          <SheetDescription>
            Only this lift at this place. Last used is already selected.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-2 pb-4">
            {(machines ?? []).length === 0 && !adding ? (
              <p className="text-muted-foreground text-sm">
                One unnamed machine here so far. Add a second when the numbers
                differ — like the corner leg press.
              </p>
            ) : null}
            {(machines ?? []).map((machine) => {
              const selected =
                machine._id === selectedMachineId ||
                (!selectedMachineId && machine.isDefault);
              return (
                <button
                  key={machine._id}
                  type="button"
                  onClick={() => void pick(machine._id)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-base",
                    selected
                      ? "border-foreground bg-foreground/5"
                      : "bg-[var(--surface)]",
                  )}
                >
                  <Settings2 className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {machine.name}
                  </span>
                  {selected ? <Check className="size-4 shrink-0" /> : null}
                </button>
              );
            })}
            {adding ? (
              <div className="flex flex-col gap-2 rounded-xl border p-3">
                <Label htmlFor="new-machine-name">New machine</Label>
                <Input
                  id="new-machine-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Corner, by the cables…"
                  className="text-base"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => void handleCreate()}
                    disabled={saving}
                  >
                    {saving ? "Adding…" : "Add"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAdding(false);
                      setNewName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setAdding(true)}
              >
                <Plus className="size-4" />
                New machine
              </Button>
            )}
          </div>
        </div>
        <SheetFooter className="shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
