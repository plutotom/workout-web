"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Unit = "lb" | "kg";

export function GeneralSettings() {
  const user = useQuery(api.routes.auth.users.current);
  const setUnit = useMutation(api.routes.auth.users.setUnit);

  // Pending edit, or null when in sync with the saved value. Derived display
  // avoids syncing server state into local state via an effect.
  const [pending, setPending] = useState<Unit | null>(null);
  const [saving, setSaving] = useState(false);

  const loading = user === undefined;
  const unit = pending ?? user?.unit ?? "lb";
  const dirty = !!user && unit !== user.unit;

  async function handleSave() {
    setSaving(true);
    try {
      await setUnit({ unit });
      setPending(null);
      toast.success("Settings saved");
    } catch {
      toast.error("Couldn't save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">General</CardTitle>
        <CardDescription>Account and unit preferences.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={user?.email ?? ""}
            readOnly
            disabled
            placeholder={loading ? "Loading…" : ""}
          />
        </div>

        <div className="grid gap-2">
          <Label>Default unit</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["lb", "kg"] as const).map((u) => (
              <Button
                key={u}
                type="button"
                variant={unit === u ? "default" : "outline"}
                disabled={loading}
                onClick={() => setPending(u)}
                className={cn(unit === u && "pointer-events-none")}
              >
                {u}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            New weights are entered in this unit.
          </p>
        </div>

        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
