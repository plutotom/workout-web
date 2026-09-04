"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Check, MapPin, Plus, Star } from "lucide-react";
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

export type PlaceOption = {
  _id: Id<"places">;
  name: string;
  starred: boolean;
  lastUsedAt: number | null;
};

export function PlaceChip({
  name,
  lastPlaceName,
  onClick,
  disabled,
}: {
  name: string | null;
  lastPlaceName?: string | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-xl border bg-[var(--surface)] px-3 text-left",
        "text-base font-medium",
        disabled && "opacity-50",
      )}
    >
      <MapPin className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{name ?? "Place"}</span>
      {lastPlaceName && lastPlaceName !== name ? (
        <span className="text-muted-foreground shrink-0 text-xs font-normal">
          Last time · {lastPlaceName}
        </span>
      ) : null}
    </button>
  );
}

export function PlacePickerSheet({
  open,
  onOpenChange,
  places,
  selectedPlaceId,
  lastPlaceId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  places: PlaceOption[];
  selectedPlaceId: Id<"places"> | null;
  lastPlaceId?: Id<"places"> | null;
  onSelect: (placeId: Id<"places">) => void | Promise<void>;
}) {
  const createPlace = useMutation(api.routes.places.mutations.create);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const { style, keyboardOpen } = useVisualViewportFrame(open, {
    mode: "dock",
  });

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Give this place a name");
      return;
    }
    setSaving(true);
    try {
      const id = await createPlace({ name });
      setNewName("");
      setAdding(false);
      await onSelect(id);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't add place",
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
          <SheetTitle>Where are you training?</SheetTitle>
          <SheetDescription>
            Last weights at this gym stay here.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-2 pb-4">
            {places.map((place) => {
              const selected = place._id === selectedPlaceId;
              return (
                <button
                  key={place._id}
                  type="button"
                  onClick={() => {
                    void onSelect(place._id);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-base",
                    selected
                      ? "border-foreground bg-foreground/5"
                      : "bg-[var(--surface)]",
                  )}
                >
                  {place.starred ? (
                    <Star className="size-4 shrink-0 fill-current" />
                  ) : (
                    <MapPin className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {place.name}
                  </span>
                  {place._id === lastPlaceId && !selected ? (
                    <span className="text-muted-foreground text-xs">
                      Last time
                    </span>
                  ) : null}
                  {selected ? <Check className="size-4 shrink-0" /> : null}
                </button>
              );
            })}
            {adding ? (
              <div className="flex flex-col gap-2 rounded-xl border p-3">
                <Label htmlFor="new-place-name">New place</Label>
                <Input
                  id="new-place-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Home gym, commercial gym, hotel…"
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
                className={cn("min-h-11", keyboardOpen && "hidden")}
                onClick={() => setAdding(true)}
              >
                <Plus className="size-4" />
                New place
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
