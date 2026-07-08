import Link from "next/link";
import { LogOut, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GeneralSettings } from "./general-settings";
import { McpSettings } from "./mcp-settings";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border bg-[var(--surface)] p-4">
        <div className="mb-8 flex size-10 items-center justify-center rounded-lg bg-muted">
          <Settings2 className="size-5" />
        </div>
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          App controls
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Units, bar defaults, and external access.
        </p>
      </div>

      <GeneralSettings />

      <McpSettings />

      <Button
        asChild
        variant="outline"
        size="lg"
        className="text-destructive hover:text-destructive mt-2 w-full"
      >
        <Link href="/sign-out" prefetch={false}>
          <LogOut className="size-4" />
          Sign out
        </Link>
      </Button>
    </div>
  );
}
