"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { PlaceChip, PlacePickerSheet } from "@/components/app/place-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function SessionPlaceBar({
  sessionId,
  placeId,
  placeName,
  editable,
  hasCompletedSets,
}: {
  sessionId: Id<"workoutSessions">;
  placeId: Id<"places"> | null;
  placeName: string | null;
  editable: boolean;
  hasCompletedSets: boolean;
}) {
  const places = useQuery(api.routes.places.queries.list);
  const setPlace = useMutation(api.routes.places.mutations.setSessionPlace);
  const [open, setOpen] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<{
    id: Id<"places">;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function applyPlace(placeIdToSet: Id<"places">) {
    setBusy(true);
    try {
      const result = await setPlace({
        sessionId,
        placeId: placeIdToSet,
      });
      if (result.hadCompletedSets) {
        const name =
          places?.find((place) => place._id === placeIdToSet)?.name ??
          "this place";
        toast.message(`Logged sets stay. This workout will count for ${name}.`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't switch place",
      );
    } finally {
      setBusy(false);
      setPendingPlace(null);
    }
  }

  return (
    <>
      <PlaceChip
        name={placeName}
        disabled={!editable || busy}
        onClick={() => {
          if (editable) setOpen(true);
        }}
      />
      <PlacePickerSheet
        open={open}
        onOpenChange={setOpen}
        places={places ?? []}
        selectedPlaceId={placeId}
        onSelect={async (id) => {
          if (id === placeId) return;
          const name = places?.find((place) => place._id === id)?.name ?? "";
          if (hasCompletedSets) {
            setPendingPlace({ id, name });
            return;
          }
          await applyPlace(id);
        }}
      />
      <Dialog
        open={pendingPlace !== null}
        onOpenChange={(next) => {
          if (!next) setPendingPlace(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to {pendingPlace?.name}?</DialogTitle>
            <DialogDescription>
              Incomplete sets pick up last weights from {pendingPlace?.name}.
              Logged sets stay as-is. When you finish, the whole workout counts
              for {pendingPlace?.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                if (pendingPlace) void applyPlace(pendingPlace.id);
              }}
            >
              Switch place
            </Button>
            <Button variant="outline" onClick={() => setPendingPlace(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
