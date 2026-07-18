"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useQuery as useCacheQuery } from "convex-helpers/react/cache/hooks";
import { CheckoutLink, CustomerPortalLink } from "@convex-dev/polar/react";
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

function formatPrice(
  amountCents: number | undefined,
  interval: string | null | undefined,
) {
  if (amountCents == null) return null;
  const dollars = (amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2);
  const suffix =
    interval === "year" ? "/yr" : interval === "month" ? "/mo" : "";
  return `$${dollars}${suffix}`;
}

function productPriceLabel(
  product:
    | {
        prices: Array<{
          priceAmount?: number;
          recurringInterval?: string | null;
        }>;
        recurringInterval?: string | null;
      }
    | undefined,
) {
  if (!product) return null;
  const price = product.prices[0];
  return formatPrice(
    price?.priceAmount,
    price?.recurringInterval ?? product.recurringInterval,
  );
}

export function PlanSettings() {
  const entitlement = useCacheQuery(api.routes.auth.users.entitlement);
  const products = useQuery(api.routes.billing.polar.getConfiguredProducts);
  const setPlanForTesting = useMutation(
    api.routes.auth.users.setPlanForTesting,
  );
  const [saving, setSaving] = useState(false);

  const loading = entitlement === undefined;
  const isPro = entitlement?.isPro === true;
  const allowManual = entitlement?.allowManualPro === true;
  const billingConfigured = entitlement?.billingConfigured === true;
  const subscription = entitlement?.subscription;

  const monthly = products?.proMonthly;
  const yearly = products?.proYearly;
  const checkoutProductIds = [monthly?.id, yearly?.id].filter(
    (id): id is string => Boolean(id),
  );

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
          Pro unlocks AI template generation. Manage billing through Polar, or
          use the testing toggle when enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">Current</p>
            <p className="text-muted-foreground text-xs">
              {loading
                ? "Loading…"
                : isPro
                  ? subscription?.productName
                    ? `Pro · ${subscription.productName}`
                    : "Pro"
                  : "Free"}
            </p>
            {subscription?.cancelAtPeriodEnd &&
            subscription.currentPeriodEnd ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Cancels{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            ) : null}
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

        {billingConfigured && checkoutProductIds.length > 0 ? (
          <div className="flex flex-col gap-2">
            {!isPro || !subscription ? (
              <>
                <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                  {monthly ? (
                    <span>Monthly {productPriceLabel(monthly) ?? ""}</span>
                  ) : null}
                  {yearly ? (
                    <span>Yearly {productPriceLabel(yearly) ?? ""}</span>
                  ) : null}
                </div>
                <CheckoutLink
                  polarApi={api.routes.billing.polar}
                  productIds={checkoutProductIds}
                  embed={false}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium shadow-xs transition-all"
                >
                  Upgrade to Pro
                </CheckoutLink>
              </>
            ) : (
              <CustomerPortalLink
                polarApi={api.routes.billing.polar}
                className="border bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium shadow-xs transition-all"
              >
                Manage subscription
              </CustomerPortalLink>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Billing isn’t configured yet. Set Convex env{" "}
            <code>POLAR_ORGANIZATION_TOKEN</code>,{" "}
            <code>POLAR_WEBHOOK_SECRET</code>,{" "}
            <code>POLAR_PRODUCT_PRO_MONTHLY</code> /{" "}
            <code>POLAR_PRODUCT_PRO_YEARLY</code>, then point Polar webhooks at{" "}
            <code>https://&lt;deployment&gt;.convex.site/polar/events</code>.
          </p>
        )}

        {allowManual ? (
          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
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
        ) : null}
      </CardContent>
    </Card>
  );
}
