"use client";

import { useState } from "react";
import { useConvex } from "convex/react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import { Button } from "@/components/ui/button";
import { assembleAccountBackup } from "@/lib/account-backup";
import {
  backupFileName,
  serializeBackup,
  type BackupSession,
} from "@/lib/workout-backup";

type SessionExportPage = {
  page: BackupSession[];
  continueCursor: string;
  isDone: boolean;
};

export function AccountBackupDownloadButton() {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const [sessionsExported, setSessionsExported] = useState(0);

  async function downloadBackup() {
    setBusy(true);
    setSessionsExported(0);
    try {
      const metadata = await convex.query(
        api.routes.accountExport.queries.metadata,
        {},
      );
      if (!metadata) throw new Error("Sign in again to export your account");

      const sessions: BackupSession[] = [];
      let cursor: string | null = null;
      let isDone = false;
      while (!isDone) {
        const result: SessionExportPage | null = await convex.query(
          api.routes.accountExport.queries.sessionsPage,
          { paginationOpts: { cursor, numItems: 10 } },
        );
        if (!result) throw new Error("Sign in again to export your account");
        sessions.push(...result.page);
        setSessionsExported(sessions.length);
        cursor = result.continueCursor;
        isDone = result.isDone;
      }

      const snapshot = assembleAccountBackup(metadata, sessions);
      const blob = new Blob([serializeBackup(snapshot)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = backupFileName(snapshot);
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(
        sessions.length === 1
          ? "Account backup downloaded with 1 workout"
          : `Account backup downloaded with ${sessions.length} workouts`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't download your account backup",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button className="w-full" disabled={busy} onClick={downloadBackup}>
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      {busy
        ? sessionsExported > 0
          ? `Exporting workouts… ${sessionsExported}`
          : "Preparing account…"
        : "Download account backup"}
    </Button>
  );
}
