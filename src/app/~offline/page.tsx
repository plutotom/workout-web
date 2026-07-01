import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <main className="bg-background text-foreground flex min-h-full flex-col items-center justify-center px-6 text-center">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Offline
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          No connection right now
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Workout needs an internet connection to sync your sessions. Check your
          network and try again.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link href="/dashboard">Try again</Link>
        </Button>
      </div>
    </main>
  );
}
