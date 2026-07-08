"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
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
import { BAR_PRESETS, STANDARD_PLATES, type Unit } from "@/lib/plates/solver";

export function GeneralSettings() {
  const user = useQuery(api.routes.auth.users.current);
  const setUnit = useMutation(api.routes.auth.users.setUnit);
  const setBar = useMutation(api.routes.auth.users.setBar);

  // Pending edits, or null when in sync with the saved value. Derived display
  // avoids syncing server state into local state via an effect.
  const [pendingUnit, setPendingUnit] = useState<Unit | null>(null);
  const [pendingBar, setPendingBar] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loading = user === undefined;
  // `unitLoaded`/`barValue` are undefined/null until the user loads, so nothing
  // is highlighted prematurely (avoids a flicker through the standard defaults).
  const unitLoaded = pendingUnit ?? user?.unit;
  const unit = unitLoaded ?? "lb";
  const savedBar = unit === "lb" ? user?.barWeightLb : user?.barWeightKg;
  const defaultBar = savedBar ?? STANDARD_PLATES[unit].bar;
  const barValue: number | null = pendingBar ?? (user ? defaultBar : null);

  const unitDirty = !!user && pendingUnit !== null && pendingUnit !== user.unit;
  const barDirty = pendingBar !== null && pendingBar !== defaultBar;
  const dirty = unitDirty || barDirty;

  function chooseUnit(u: Unit) {
    setPendingUnit(u);
    // Bar default is per-unit; drop a pending bar that was for the old unit.
    setPendingBar(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (unitDirty) await setUnit({ unit });
      if (barDirty && pendingBar !== null)
        await setBar({ unit, barWeight: pendingBar });
      setPendingUnit(null);
      setPendingBar(null);
      toast.success("Settings saved");
    } catch {
      toast.error("Couldn't save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-[var(--surface)]">
      <CardHeader>
        <CardTitle className="text-base">General</CardTitle>
        <CardDescription>Account, units, and bar.</CardDescription>
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
                variant={unitLoaded === u ? "default" : "outline"}
                disabled={loading}
                onClick={() => chooseUnit(u)}
                className={cn(unitLoaded === u && "pointer-events-none")}
              >
                {u}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            New weights are entered in this unit.
          </p>
        </div>

        <div className="grid gap-2">
          <Label>Default bar ({unit})</Label>
          <div className="flex flex-wrap items-center gap-2">
            {BAR_PRESETS[unit].map((b) => (
              <Button
                key={b}
                type="button"
                size="sm"
                variant={barValue === b ? "default" : "outline"}
                disabled={loading}
                onClick={() => setPendingBar(b)}
              >
                {b} {unit}
              </Button>
            ))}
            <Input
              inputMode="numeric"
              value={barValue === null ? "" : String(barValue)}
              disabled={loading}
              aria-label="Custom bar weight"
              className="h-8 w-24"
              onChange={(e) =>
                setPendingBar(
                  Number(e.target.value.replace(/[^0-9]/g, "") || 0),
                )
              }
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Used by the plate calculator. You can still change it
            per-calculation.
          </p>
        </div>

        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
