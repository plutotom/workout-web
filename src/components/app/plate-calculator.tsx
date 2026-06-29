"use client";

import { useMemo, useState } from "react";
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
  BAR_PRESETS,
  platesToWeight,
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
  const [countBar, setCountBar] = useState(defaultIncludeBar);
  const savedBar =
    (unit === "lb" ? user?.barWeightLb : user?.barWeightKg) ??
    STANDARD_PLATES[unit].bar;

  // Per-calculation bar override (transient — the saved default lives in
  // Settings). null means "use the default".
  const [barOverride, setBarOverride] = useState<number | null>(null);
  const defaultBar = countBar ? savedBar : 0;
  const bar = barOverride ?? defaultBar;
  const config: PlateConfig = { bar, plates: STANDARD_PLATES[unit].plates };

  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue="toPlates" className="gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="toPlates">Weight → Plates</TabsTrigger>
          <TabsTrigger value="toWeight">Plates → Weight</TabsTrigger>
        </TabsList>

        <TabsContent value="toPlates">
          <WeightToPlates
            initialWeight={initialWeight}
            config={config}
            unit={unit}
            countBar={countBar}
            onApply={onApply}
          />
        </TabsContent>
        <TabsContent value="toWeight">
          <PlatesToWeight
            config={config}
            unit={unit}
            countBar={countBar}
            onApply={onApply}
          />
        </TabsContent>
      </Tabs>

      <BarControl
        bar={bar}
        unit={unit}
        countBar={countBar}
        onCountBarChange={(next) => {
          setCountBar(next);
          setBarOverride(null);
        }}
        onChange={setBarOverride}
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

function PlateChip({ plate, count }: PlateCount) {
  return (
    <span className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm tabular-nums">
      {fmt(plate)}
      <span className="text-muted-foreground">×{count}</span>
    </span>
  );
}

function WeightToPlates({
  initialWeight,
  config,
  unit,
  countBar,
  onApply,
}: {
  initialWeight: number;
  config: PlateConfig;
  unit: Unit;
  countBar: boolean;
  onApply?: (weight: number) => void;
}) {
  const [value, setValue] = useState(
    initialWeight > 0 ? String(initialWeight) : "",
  );
  const target = value.trim() === "" ? 0 : Number(value);
  const result = useMemo(
    () => solveWeightToPlates(target, config),
    [target, config],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="plate-target">Target weight ({unit})</Label>
        <Input
          id="plate-target"
          inputMode="numeric"
          value={value}
          placeholder="135"
          className="text-center"
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>

      {countBar ? (
        <p className="text-muted-foreground text-sm">
          Bar: {fmt(config.bar)} {unit}
        </p>
      ) : null}

      {target === 0 ? (
        <p className="text-muted-foreground text-sm">
          Enter a weight to see the load per side.
        </p>
      ) : !result.feasible ? (
        <p className="text-muted-foreground text-sm">
          {countBar
            ? `Below the bar (${fmt(config.bar)} ${unit}).`
            : "Enter a valid weight."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
              Each side
            </p>
            {result.perSide.length === 0 ? (
              <p className="text-sm">
                {countBar ? "Just the bar." : "No plates needed."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {result.perSide.map((p) => (
                  <PlateChip key={p.plate} plate={p.plate} count={p.count} />
                ))}
              </div>
            )}
          </div>

          <p className="text-sm">
            {result.exact ? (
              <span className="text-success font-medium">
                Loads exactly to {fmt(result.loadedTotal)} {unit}.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Closest is {fmt(result.loadedTotal)} {unit} (
                {fmt(result.remainder)} {unit} short).
              </span>
            )}
          </p>

          {onApply ? (
            <div className="flex flex-col gap-2">
              <Button onClick={() => onApply(target)}>
                Use this weight ({fmt(target)} {unit})
              </Button>
              {!result.exact ? (
                <Button
                  variant="outline"
                  onClick={() => onApply(result.loadedTotal)}
                >
                  Use closest loadable ({fmt(result.loadedTotal)} {unit})
                </Button>
              ) : null}
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
  onApply,
}: {
  config: PlateConfig;
  unit: Unit;
  countBar: boolean;
  onApply?: (weight: number) => void;
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});

  const perSide: PlateCount[] = useMemo(
    () =>
      config.plates
        .filter((plate) => (counts[plate] ?? 0) > 0)
        .map((plate) => ({ plate, count: counts[plate] })),
    [counts, config.plates],
  );
  const total = platesToWeight(perSide, config);
  const perSideSum = (total - config.bar) / 2;

  function add(plate: number, delta: number) {
    setCounts((prev) => {
      const next = Math.max(0, (prev[plate] ?? 0) + delta);
      return { ...prev, [plate]: next };
    });
  }

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
      {perSide.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {perSide.map((p) => (
            <button
              key={p.plate}
              type="button"
              aria-label={`Remove one ${fmt(p.plate)}`}
              onClick={() => add(p.plate, -1)}
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
              variant="secondary"
              className="relative tabular-nums"
              onClick={() => add(plate, 1)}
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
          disabled={perSide.length === 0}
          onClick={() => setCounts({})}
        >
          Clear
        </Button>
        {onApply ? (
          <Button
            variant="outline"
            className="flex-1"
            disabled={perSide.length === 0}
            onClick={() => onApply(total)}
          >
            Use {fmt(total)} {unit}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
