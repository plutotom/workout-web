"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useQuery as useCacheQuery } from "convex-helpers/react/cache/hooks";
import { ArrowLeft, Shield } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function AdminPage() {
  const entitlement = useCacheQuery(api.routes.auth.users.entitlement);
  const users = useQuery(
    api.routes.admin.users.listUsers,
    entitlement?.isAdmin ? {} : "skip",
  );
  const setUserPlan = useMutation(api.routes.admin.users.setUserPlan);

  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<Id<"users"> | null>(null);

  const loadingEntitlement = entitlement === undefined;
  const isAdmin = entitlement?.isAdmin === true;

  const filtered =
    users?.filter((user) =>
      user.email.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];

  async function setPlan(userId: Id<"users">, plan: "free" | "pro") {
    setSavingId(userId);
    try {
      await setUserPlan({ userId, plan });
      toast.success(plan === "pro" ? "Pro granted" : "Pro revoked");
    } catch {
      toast.error("Couldn't update plan");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border bg-[var(--surface)] p-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 h-10 px-2"
        >
          <Link href="/settings">
            <ArrowLeft className="size-4" />
            Settings
          </Link>
        </Button>
        <div className="mb-8 flex size-10 items-center justify-center rounded-lg bg-muted">
          <Shield className="size-5" />
        </div>
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Pro access
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Grant Pro to users by email. Polar subscribers stay Pro regardless.
        </p>
      </div>

      {loadingEntitlement ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : !isAdmin ? (
        <div className="rounded-xl border p-4">
          <p className="text-sm font-medium">Admin access required</p>
          <p className="text-muted-foreground mt-1 text-sm">
            You don’t have permission to manage Pro access.
          </p>
          <Button asChild variant="outline" className="mt-4 h-11 w-full">
            <Link href="/settings">Back to Settings</Link>
          </Button>
        </div>
      ) : (
        <>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email"
            className="h-11"
            autoComplete="off"
            enterKeyHint="search"
          />

          {users === undefined ? (
            <p className="text-muted-foreground text-sm">Loading users…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {search.trim() ? "No matching users." : "No users yet."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((user) => {
                const isPro = user.plan === "pro";
                const busy = savingId === user._id;
                return (
                  <li
                    key={user._id}
                    className="flex flex-col gap-3 rounded-xl border bg-[var(--surface)] p-3"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {user.email || "(no email)"}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {user.role === "admin" ? "Admin · " : ""}
                          Joined {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                          isPro
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isPro ? "Pro" : "Free"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={isPro ? "outline" : "default"}
                        className="h-11 flex-1"
                        disabled={busy || isPro}
                        onClick={() => setPlan(user._id, "pro")}
                      >
                        Grant Pro
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 flex-1"
                        disabled={busy || !isPro}
                        onClick={() => setPlan(user._id, "free")}
                      >
                        Revoke
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
