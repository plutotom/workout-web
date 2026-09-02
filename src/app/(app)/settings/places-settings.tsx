"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Archive, Pencil, Plus, Star } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function PlacesSettings() {
  const places = useQuery(api.routes.places.queries.list);
  const createPlace = useMutation(api.routes.places.mutations.create);
  const renamePlace = useMutation(api.routes.places.mutations.rename);
  const starPlace = useMutation(api.routes.places.mutations.star);
  const archivePlace = useMutation(api.routes.places.mutations.archive);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<{
    id: Id<"places">;
    name: string;
  } | null>(null);
  const [archiving, setArchiving] = useState<{
    id: Id<"places">;
    name: string;
  } | null>(null);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Give this place a name");
      return;
    }
    setSaving(true);
    try {
      await createPlace({ name });
      setNewName("");
      setAdding(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't add place",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name) {
      toast.error("Give this place a name");
      return;
    }
    setSaving(true);
    try {
      await renamePlace({ placeId: renaming.id, name });
      setRenaming(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't rename place",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStar(placeId: Id<"places">) {
    try {
      await starPlace({ placeId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't star place",
      );
    }
  }

  async function handleArchive() {
    if (!archiving) return;
    setSaving(true);
    try {
      await archivePlace({ placeId: archiving.id });
      setArchiving(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't remove place",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-[var(--surface)]">
      <CardHeader>
        <CardTitle className="text-base">Places</CardTitle>
        <CardDescription>
          Home, Elgin, Wheaton — working weights are remembered per place.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {(places ?? []).map((place) => (
          <div
            key={place._id}
            className="flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2"
          >
            <button
              type="button"
              onClick={() => {
                if (!place.starred) void handleStar(place._id);
              }}
              className="flex size-11 shrink-0 items-center justify-center"
              aria-label={
                place.starred ? "Starred home place" : `Star ${place.name}`
              }
            >
              <Star
                className={cn(
                  "size-4",
                  place.starred ? "fill-current" : "text-muted-foreground",
                )}
              />
            </button>
            <span className="min-w-0 flex-1 truncate text-base font-medium">
              {place.name}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Rename ${place.name}`}
              onClick={() => setRenaming({ id: place._id, name: place.name })}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove ${place.name}`}
              disabled={place.starred}
              onClick={() => setArchiving({ id: place._id, name: place.name })}
            >
              <Archive className="size-4" />
            </Button>
          </div>
        ))}

        {adding ? (
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <Label htmlFor="settings-new-place">New place</Label>
            <Input
              id="settings-new-place"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Elgin, Wheaton…"
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
            New place
          </Button>
        )}
      </CardContent>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename place</DialogTitle>
            <DialogDescription>
              This name is stored on workouts you finish here.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renaming?.name ?? ""}
            onChange={(e) =>
              setRenaming((current) =>
                current ? { ...current, name: e.target.value } : current,
              )
            }
            className="text-base"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenaming(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleRename()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {archiving?.name}?</DialogTitle>
            <DialogDescription>
              Past workouts keep the name. You can add this place again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiving(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleArchive()}
              disabled={saving}
            >
              {saving ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
