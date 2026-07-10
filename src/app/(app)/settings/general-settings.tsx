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

type WorkoutMode = "list" | "focus";

const WORKOUT_MODES: { value: WorkoutMode; label: string; hint: string }[] = [
  { value: "list", label: "List", hint: "All sets on one screen" },
  { value: "focus", label: "Focus", hint: "One set at a time" },
];

export function GeneralSettings() {
  const user = useQuery(api.routes.auth.users.current);
  const setUnit = useMutation(api.routes.auth.users.setUnit);
  const setBar = useMutation(api.routes.auth.users.setBar);
  const setActiveWorkoutMode = useMutation(
    api.routes.auth.users.setActiveWorkoutMode,
  );
  const setRestTimerEnabled = useMutation(
    api.routes.auth.users.setRestTimerEnabled,
  );

  // Pending edits, or null when in sync with the saved value. Derived display
  // avoids syncing server state into local state via an effect.
  const [pendingUnit, setPendingUnit] = useState<Unit | null>(null);
  const [pendingBar, setPendingBar] = useState<number | null>(null);
  const [pendingMode, setPendingMode] = useState<WorkoutMode | null>(null);
  const [pendingRestTimer, setPendingRestTimer] = useState<boolean | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const loading = user === undefined;
  // `unitLoaded`/`barValue` are undefined/null until the user loads, so nothing
  // is highlighted prematurely (avoids a flicker through the standard defaults).
  const unitLoaded = pendingUnit ?? user?.unit;
  const unit = unitLoaded ?? "lb";
  const savedBar = unit === "lb" ? user?.barWeightLb : user?.barWeightKg;
  const defaultBar = savedBar ?? STANDARD_PLATES[unit].bar;
  const barValue: number | null = pendingBar ?? (user ? defaultBar : null);

  const savedMode: WorkoutMode = user?.activeWorkoutMode ?? "list";
  const modeLoaded = pendingMode ?? (user ? savedMode : undefined);
  const savedRestTimer = user?.restTimerEnabled ?? true;
  const restTimerLoaded =
    pendingRestTimer ?? (user ? savedRestTimer : undefined);

  const unitDirty = !!user && pendingUnit !== null && pendingUnit !== user.unit;
  const barDirty = pendingBar !== null && pendingBar !== defaultBar;
  const modeDirty = !!user && pendingMode !== null && pendingMode !== savedMode;
  const restTimerDirty =
    !!user && pendingRestTimer !== null && pendingRestTimer !== savedRestTimer;
  const dirty = unitDirty || barDirty || modeDirty || restTimerDirty;

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
      if (modeDirty && pendingMode !== null)
        await setActiveWorkoutMode({ mode: pendingMode });
      if (restTimerDirty && pendingRestTimer !== null)
        await setRestTimerEnabled({ enabled: pendingRestTimer });
      setPendingUnit(null);
      setPendingBar(null);
      setPendingMode(null);
      setPendingRestTimer(null);
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
          <Label>Active workout view</Label>
          <div className="grid grid-cols-2 gap-2">
            {WORKOUT_MODES.map((m) => (
              <Button
                key={m.value}
                type="button"
                variant={modeLoaded === m.value ? "default" : "outline"}
                disabled={loading}
                onClick={() => setPendingMode(m.value)}
                className={cn(
                  "h-auto flex-col gap-0.5 py-2",
                  modeLoaded === m.value && "pointer-events-none",
                )}
              >
                <span>{m.label}</span>
                <span className="text-xs font-normal opacity-70">{m.hint}</span>
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            How an in-progress workout is shown. Switching mid-workout is safe —
            both views share the same session.
          </p>
        </div>

        <div className="grid gap-2">
          <Label>Rest timer</Label>
          <div className="grid grid-cols-2 gap-2">
            {([true, false] as const).map((enabled) => (
              <Button
                key={String(enabled)}
                type="button"
                variant={restTimerLoaded === enabled ? "default" : "outline"}
                disabled={loading}
                onClick={() => setPendingRestTimer(enabled)}
                className={cn(
                  restTimerLoaded === enabled && "pointer-events-none",
                )}
              >
                {enabled ? "On" : "Off"}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            When off, logging a set won&apos;t start a rest countdown. The
            workout clock still runs.
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
