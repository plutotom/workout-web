"use client";

import { useEffect, useRef, useState } from "react";

import { PlateCalcButton } from "@/components/app/plate-calculator";
import { Input } from "@/components/ui/input";
import {
  effectiveLiftWeight,
  parseLiftNumber,
  sanitizeWeightDraft,
} from "@/lib/parse-lift-number";
import { cn } from "@/lib/utils";

/** Select the whole field on focus so a quick tap replaces the value. */
function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

type LiftWeightInputProps = {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
  plateCalc?: {
    includeBar: boolean;
    onApply?: (weight: number) => void;
    buttonClassName?: string;
    buttonAriaLabel?: string;
  };
};

export function LiftWeightInput({
  value,
  onCommit,
  disabled,
  placeholder = "0",
  className,
  inputClassName,
  "aria-label": ariaLabel,
  plateCalc,
}: LiftWeightInputProps) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDraft(value ? String(value) : "");
    }
  }, [value]);

  function commit(raw: string) {
    const parsed = parseLiftNumber(raw);
    if (parsed === null) {
      setDraft(value ? String(value) : "");
      return;
    }
    setDraft(parsed === 0 ? "" : String(parsed));
    if (parsed !== value) onCommit(parsed);
  }

  const input = (
    <Input
      type="text"
      inputMode="text"
      enterKeyHint="done"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(plateCalc && "pr-8", inputClassName)}
      aria-label={ariaLabel}
      onFocus={(e) => {
        focused.current = true;
        selectOnFocus(e);
      }}
      onChange={(e) => setDraft(sanitizeWeightDraft(e.target.value))}
      onBlur={(e) => {
        focused.current = false;
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );

  if (!plateCalc) return input;

  return (
    <div className={cn("relative", className)}>
      {input}
      <PlateCalcButton
        weight={effectiveLiftWeight(draft, value)}
        includeBar={plateCalc.includeBar}
        onApply={plateCalc.onApply}
        aria-label={plateCalc.buttonAriaLabel}
        className={cn(
          "absolute top-1/2 right-0.5 size-8 -translate-y-1/2",
          plateCalc.buttonClassName,
        )}
      />
    </div>
  );
}
