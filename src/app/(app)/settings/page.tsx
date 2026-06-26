import Link from "next/link";
import { LogOut } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { GeneralSettings } from "./general-settings";
import { McpSettings } from "./mcp-settings";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" />

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
