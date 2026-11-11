"use client";

import { useMemo, useReducer, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Weight, X } from "lucide-react";

import { api } from "@backend/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  createPlateSession,
  hasLoadedPlates,
  perSideFromPlateCounts,
  reducePlateSession,
  sessionConfig,
  sessionTotal,
} from "@/lib/plates/composition";
import {
  BAR_PRESETS,
  solveWeightToPlates,
  STANDARD_PLATES,
  type PlateConfig,
  type PlateCount,
  type Unit,
} from "@/lib/plates/solver";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Icon button that opens the plate calculator for a given weight. */
export function PlateCalcButton({
  weight,
  onApply,
  includeBar = true,
  className,
  "aria-label": ariaLabel = "Plate calculator",
}: {
  weight: number;
  onApply?: (weight: number) => void;
  /** Initial barbell toggle; user can change it inside the calculator. */
  includeBar?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={ariaLabel}
        className={cn("text-muted-foreground hover:text-foreground", className)}
        onClick={() => setOpen(true)}
      >
        <Weight className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Plate calculator</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {open ? (
              <PlateCalculator
                initialWeight={weight}
                defaultIncludeBar={includeBar}
                onApply={
                  onApply
                    ? (w) => {
                        onApply(w);
                        setOpen(false);
                      }
                    : undefined
                }
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function PlateCalculator({
  initialWeight,
  defaultIncludeBar = true,
  onApply,
}: {
  initialWeight: number;
  /** Initial barbell toggle; user can change it inside the calculator. */
  defaultIncludeBar?: boolean;
  onApply?: (weight: number) => void;
}) {
  const user = useQuery(api.routes.auth.users.current);
  const unit: Unit = user?.unit ?? "lb";
  const savedBar =
    (unit === "lb" ? user?.barWeightLb : user?.barWeightKg) ??
    STANDARD_PLATES[unit].bar;
  const [state, dispatch] = useReducer(
    reducePlateSession,
    {
      target: initialWeight,
      unit,
      barWeight: savedBar,
      countBar: defaultIncludeBar,
    },
    createPlateSession,
  );
  const config: PlateConfig = sessionConfig(
    state,
    STANDARD_PLATES[unit].plates,
  );
  const selectedPlates = perSideFromPlateCounts(state.counts, config.plates);
  const total = sessionTotal(state, config.plates);

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={state.mode}
        onValueChange={(mode) =>
          dispatch({
            type: "setMode",
            mode: mode === "toWeight" ? "toWeight" : "toPlates",
          })
        }
        className="gap-4"
      >
        <TabsList className="w-full">
          <TabsTrigger value="toPlates">Weight → Plates</TabsTrigger>
          <TabsTrigger value="toWeight">
            {hasLoadedPlates(state.counts) ? "Edit bar" : "Plates → Weight"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="toPlates">
          <WeightToPlates
            draft={state.draft}
            onDraftChange={(value) =>
              dispatch({ type: "setTargetDraft", value })
            }
            config={config}
            unit={unit}
            countBar={state.countBar}
            selectedPlates={selectedPlates}
            counts={state.counts}
            total={total}
            onChangeCount={(plate, delta) =>
              dispatch({ type: "changeCount", plate, delta })
            }
            onApply={onApply}
          />
        </TabsContent>
        <TabsContent value="toWeight">
          <PlatesToWeight
            config={config}
            unit={unit}
            countBar={state.countBar}
            selectedPlates={selectedPlates}
            counts={state.counts}
            total={total}
            onChangeCount={(plate, delta) =>
              dispatch({ type: "changeCount", plate, delta })
            }
            onClear={() => dispatch({ type: "clearPlates" })}
            onApply={onApply}
          />
        </TabsContent>
      </Tabs>

      <BarControl
        bar={state.bar}
        unit={unit}
        countBar={state.countBar}
        onCountBarChange={(next) =>
          dispatch({ type: "setCountBar", countBar: next })
        }
        onChange={(next) => dispatch({ type: "selectBar", bar: next })}
      />
    </div>
  );
}

/** Barbell toggle + optional bar weight selector. */
function BarControl({
  bar,
  unit,
  countBar,
  onCountBarChange,
  onChange,
}: {
  bar: number;
  unit: Unit;
  countBar: boolean;
  onCountBarChange: (countBar: boolean) => void;
  onChange: (bar: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-normal">Include barbell</Label>
        <Button
          type="button"
          size="sm"
          variant={countBar ? "default" : "outline"}
          aria-pressed={countBar}
          onClick={() => onCountBarChange(!countBar)}
        >
          {countBar ? "On" : "Off"}
        </Button>
      </div>

      {countBar ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground mt-3 flex w-full items-center justify-between text-sm"
          >
            <span>
              Bar weight: {fmt(bar)} {unit}
            </span>
            <span className="underline underline-offset-2">
              {open ? "Done" : "Change"}
            </span>
          </button>

          {open ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {BAR_PRESETS[unit].map((b) => (
                <Button
                  key={b}
                  type="button"
                  size="sm"
                  variant={bar === b ? "default" : "outline"}
                  onClick={() => onChange(b)}
                >
                  {fmt(b)} {unit}
                </Button>
              ))}
              <Input
                inputMode="numeric"
                value={custom}
                placeholder="Custom"
                className="h-8 w-24"
                aria-label="Custom bar weight"
                onChange={(e) =>
                  setCustom(e.target.value.replace(/[^0-9]/g, ""))
                }
                onBlur={() => {
                  if (custom !== "") onChange(Number(custom));
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function WeightToPlates({
  draft,
  onDraftChange,
  config,
  unit,
  countBar,
  selectedPlates,
  counts,
  total,
  onChangeCount,
  onApply,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  config: PlateConfig;
  unit: Unit;
  countBar: boolean;
  selectedPlates: PlateCount[];
  counts: Record<number, number>;
  total: number;
  onChangeCount: (plate: number, delta: number) => void;
  onApply?: (weight: number) => void;
}) {
  const target = draft.trim() === "" ? 0 : Number(draft);
  const result = useMemo(
    () => solveWeightToPlates(target, config),
    [target, config],
  );
  const hasPlates = selectedPlates.length > 0;
  const exact = !draft.trim() || Math.abs(total - target) < 1e-6;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="plate-target">Target weight ({unit})</Label>
        <Input
          id="plate-target"
          inputMode="numeric"
          value={draft}
          placeholder="135"
          className="text-center"
          onChange={(e) => onDraftChange(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>

      {countBar ? (
        <p className="text-muted-foreground text-sm">
          Bar: {fmt(config.bar)} {unit}
        </p>
      ) : null}

      {target === 0 && !hasPlates ? (
        <p className="text-muted-foreground text-sm">
          Enter a weight to see the load per side.
        </p>
      ) : !result.feasible && !hasPlates ? (
        <p className="text-muted-foreground text-sm">
          {countBar
            ? `Below the bar (${fmt(config.bar)} ${unit}).`
            : "Enter a valid weight."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
              Each side · tap to remove
            </p>
            {selectedPlates.length === 0 ? (
              <p className="text-sm">
                {countBar ? "Just the bar." : "No plates needed."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedPlates.map((p) => (
                  <button
                    key={p.plate}
                    type="button"
                    aria-label={`Remove one ${fmt(p.plate)}`}
                    onClick={() => onChangeCount(p.plate, -1)}
                    className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm tabular-nums"
                  >
                    {fmt(p.plate)}
                    <span className="text-muted-foreground">×{p.count}</span>
                    <X className="text-muted-foreground size-3.5" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-sm">
            {exact ? (
              <span className="text-success font-medium">
                Loads exactly to {fmt(total)} {unit}.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Closest is {fmt(total)} {unit} ({fmt(result.remainder)} {unit}{" "}
                short).
              </span>
            )}
          </p>

          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
              Tap to add per side
            </p>
            <div className="grid grid-cols-3 gap-2">
              {config.plates.map((plate) => (
                <Button
                  key={plate}
                  type="button"
                  variant="secondary"
                  className="relative tabular-nums"
                  onClick={() => onChangeCount(plate, 1)}
                >
                  {fmt(plate)}
                  {(counts[plate] ?? 0) > 0 ? (
                    <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-xs">
                      {counts[plate]}
                    </span>
                  ) : null}
                </Button>
              ))}
            </div>
          </div>

          {onApply ? (
            <div className="flex flex-col gap-2">
              <Button onClick={() => onApply(total)}>
                Use {fmt(total)} {unit}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PlatesToWeight({
  config,
  unit,
  countBar,
  selectedPlates,
  counts,
  total,
  onChangeCount,
  onClear,
  onApply,
}: {
  config: PlateConfig;
  unit: Unit;
  countBar: boolean;
  selectedPlates: PlateCount[];
  counts: Record<number, number>;
  total: number;
  onChangeCount: (plate: number, delta: number) => void;
  onClear: () => void;
  onApply?: (weight: number) => void;
}) {
  const perSideSum = (total - config.bar) / 2;

  return (
    <div className="flex flex-col gap-4">
      {countBar ? (
        <p className="text-muted-foreground text-sm">
          Bar: {fmt(config.bar)} {unit}
        </p>
      ) : null}

      {/* Selected plates sit ABOVE the buttons: when they wrap onto more rows,
          only the content above them shifts up — the buttons below stay put
          (the sheet is anchored to the bottom). */}
      {selectedPlates.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedPlates.map((p) => (
            <button
              key={p.plate}
              type="button"
              aria-label={`Remove one ${fmt(p.plate)}`}
              onClick={() => onChangeCount(p.plate, -1)}
              className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm tabular-nums"
            >
              {fmt(p.plate)}
              <span className="text-muted-foreground">×{p.count}</span>
              <X className="text-muted-foreground size-3.5" />
            </button>
          ))}
        </div>
      ) : null}

      <div>
        <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
          Tap to add per side
        </p>
        <div className="grid grid-cols-3 gap-2">
          {config.plates.map((plate) => (
            <Button
              key={plate}
              type="button"
              variant="secondary"
              className="relative tabular-nums"
              onClick={() => onChangeCount(plate, 1)}
            >
              {fmt(plate)}
              {(counts[plate] ?? 0) > 0 ? (
                <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-xs">
                  {counts[plate]}
                </span>
              ) : null}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm">
        Total:{" "}
        <span className="font-medium">
          {fmt(total)} {unit}
        </span>
        <span className="text-muted-foreground">
          {countBar
            ? ` · ${fmt(config.bar)} bar + ${fmt(perSideSum)} / side`
            : ` · ${fmt(perSideSum)} / side`}
        </span>
      </p>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          disabled={selectedPlates.length === 0}
          onClick={onClear}
        >
          Clear
        </Button>
        {onApply ? (
          <Button
            variant="outline"
            className="flex-1"
            disabled={total <= 0}
            onClick={() => onApply(total)}
          >
            Use {fmt(total)} {unit}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
