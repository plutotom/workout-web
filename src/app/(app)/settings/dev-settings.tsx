"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { FlaskConical } from "lucide-react";
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

/** Development-only testing controls. Never rendered in production builds. */
export function DevSettings() {
  const resetOnboarding = useMutation(
    api.routes.auth.users.resetOnboardingForTesting,
  );
  const [busy, setBusy] = useState(false);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  async function handleResetOnboarding() {
    setBusy(true);
    try {
      await resetOnboarding({});
      toast.success("Onboarding reset");
    } catch {
      toast.error("Couldn't reset onboarding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted">
          <FlaskConical className="size-4" />
        </div>
        <CardTitle>Dev</CardTitle>
        <CardDescription>
          Local testing helpers. Not shown in production.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full"
          disabled={busy}
          onClick={() => void handleResetOnboarding()}
        >
          {busy ? "Resetting…" : "Reset onboarding"}
        </Button>
      </CardContent>
    </Card>
  );
}
