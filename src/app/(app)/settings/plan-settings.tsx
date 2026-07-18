"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Crown } from "lucide-react";
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

export function PlanSettings() {
  const entitlement = useQuery(api.routes.auth.users.entitlement);
  const setPlanForTesting = useMutation(
    api.routes.auth.users.setPlanForTesting,
  );
  const [saving, setSaving] = useState(false);

  const loading = entitlement === undefined;
  const isPro = entitlement?.isPro === true;
  const allowManual = entitlement?.allowManualPro === true;

  async function setPlan(plan: "free" | "pro") {
    setSaving(true);
    try {
      await setPlanForTesting({ plan });
      toast.success(plan === "pro" ? "Pro enabled (testing)" : "Back to Free");
    } catch {
      toast.error("Couldn't update plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted">
          <Crown className="size-4" />
        </div>
        <CardTitle>Plan</CardTitle>
        <CardDescription>
          AI template generation requires Pro. Billing is not wired yet — use
          the testing toggle when enabled, or set{" "}
          <code className="text-xs">PRO_EMAILS</code> /{" "}
          <code className="text-xs">plan</code> on your user.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Current</p>
            <p className="text-muted-foreground text-xs">
              {loading ? "Loading…" : isPro ? "Pro" : "Free"}
            </p>
          </div>
          <span
            className={
              isPro
                ? "rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                : "rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
            }
          >
            {loading ? "…" : isPro ? "Pro" : "Free"}
          </span>
        </div>

        {allowManual ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant={isPro ? "outline" : "default"}
              disabled={loading || saving || isPro}
              onClick={() => setPlan("pro")}
              className="sm:flex-1"
            >
              Enable Pro (testing)
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading || saving || !isPro}
              onClick={() => setPlan("free")}
              className="sm:flex-1"
            >
              Switch to Free
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Manual Pro toggle is off. Set Convex env{" "}
            <code>ALLOW_MANUAL_PRO=true</code> to enable testing upgrades.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
