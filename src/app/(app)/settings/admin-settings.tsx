"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Shield } from "lucide-react";

import { api } from "@backend/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AdminSettings() {
  const entitlement = useQuery(api.routes.auth.users.entitlement);

  if (entitlement === undefined || !entitlement?.isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted">
          <Shield className="size-4" />
        </div>
        <CardTitle>Admin</CardTitle>
        <CardDescription>
          Grant or revoke Pro for users without a Polar subscription.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="h-11 w-full" size="lg">
          <Link href="/settings/admin">Manage Pro access</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
