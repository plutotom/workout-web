"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Check, Copy, Download, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { AccountBackupDownloadButton } from "@/components/app/account-backup-download-button";
import { TemplateShareDialog } from "@/components/app/template-share-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { shareUrl } from "@/lib/workout-export";

function formatExpiry(expiresAt: number | undefined): string {
  if (!expiresAt) return "Never expires";
  const days = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60_000));
  if (days <= 0) return "Expired";
  return days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
}

/** Export/import entry points plus management of live share links. */
export function DataSettings() {
  const shares = useQuery(api.routes.shares.queries.list);
  const revoke = useMutation(api.routes.shares.mutations.revoke);
  const [copied, setCopied] = useState<string | null>(null);

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(
        shareUrl(window.location.origin, token),
      );
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy that link");
    }
  }

  async function handleRevoke(shareId: Id<"templateShares">) {
    try {
      await revoke({ shareId });
      toast.success("Link revoked");
    } catch {
      toast.error("Couldn't revoke that link");
    }
  }

  return (
    <>
      <Card className="bg-[var(--surface)]">
        <CardHeader>
          <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted">
            <Smartphone className="size-4" />
          </div>
          <CardTitle>Move to iPhone</CardTitle>
          <CardDescription>
            Download your preferences, templates, custom exercises, notes, and
            complete workout history. In the iPhone app, open Settings → Backup
            → Restore from a file.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <AccountBackupDownloadButton />
          <p className="text-muted-foreground text-xs leading-relaxed">
            This file isn&apos;t encrypted. Anyone who opens it can read your
            training history, so keep it somewhere private.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-[var(--surface)]">
        <CardHeader>
          <CardTitle>Share templates</CardTitle>
          <CardDescription>
            Send templates to a friend, or bring in someone else&apos;s.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TemplateShareDialog
              label="Share all templates"
              className="w-full"
            />
            <Button asChild variant="outline">
              <Link href="/templates/import">
                <Download className="size-4" />
                Import templates
              </Link>
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Active share links</h3>
            {shares === undefined ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : shares.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No live links. Anyone with a link can import the templates it
                was created from, so revoke one when you&apos;re done sharing.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {shares.map((share) => (
                  <li
                    key={share._id}
                    className="flex items-center gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {share.templateNames.join(", ") || "Untitled"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatExpiry(share.expiresAt)}
                        {share.importCount > 0
                          ? ` · imported ${share.importCount}×`
                          : " · not imported yet"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Copy link"
                      onClick={() => copyLink(share.token)}
                    >
                      {copied === share.token ? (
                        <Check className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Revoke link"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRevoke(share._id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
