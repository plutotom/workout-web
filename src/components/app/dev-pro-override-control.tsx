"use client";

import { useEffect } from "react";

import { useDevProOverride } from "@/hooks/use-dev-pro-override";
import {
  devProOverrideAllowed,
  readDevProOverride,
  syncDevProOverrideCookie,
  type DevProOverride,
} from "@/lib/dev-pro-override";
import { Button } from "@/components/ui/button";

const OPTIONS: { value: DevProOverride; label: string }[] = [
  { value: "server", label: "Server" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
];

/** Dev-only segmented control for Pro gating without billing or admin toggles. */
export function DevProOverrideControl() {
  const [override, setOverride] = useDevProOverride();

  useEffect(() => {
    syncDevProOverrideCookie(readDevProOverride());
  }, []);

  if (!devProOverrideAllowed()) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Pro override</p>
      <p className="text-muted-foreground text-xs">
        Force Free or Pro for UI and local AI routes. Works without signing in
        for gates; Pro AI API calls still need an active session.
      </p>
      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={override === option.value ? "default" : "outline"}
            className="flex-1"
            onClick={() => setOverride(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
