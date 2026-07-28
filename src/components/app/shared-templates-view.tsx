"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useMutation, useQuery } from "convex/react";
import { Check, Dumbbell, Loader2, LogIn, Upload } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import { BundlePreview } from "@/components/app/bundle-preview";
import { Button } from "@/components/ui/button";
import { sharePath, validateBundle } from "@/lib/workout-export";

/**
 * Public landing page for a share link.
 *
 * Renders for signed-out visitors on purpose — the recipient often has no
 * account yet, and being able to see what a friend sent before signing up is
 * the whole point of the link. Importing still requires signing in.
 */
export function SharedTemplatesView({ token }: { token: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const share = useQuery(api.routes.shares.queries.preview, { token });
  const importFromToken = useMutation(
    api.routes.shares.mutations.importFromToken,
  );

  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleImport() {
    setImporting(true);
    try {
      const result = await importFromToken({ token });
      setDone(true);
      toast.success(
        result.templatesImported === 1
          ? `Imported "${result.names[0]}"`
          : `Imported ${result.templatesImported} templates`,
      );
      router.push("/templates");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't import these workouts",
      );
    } finally {
      setImporting(false);
    }
  }

  const parsed = share ? validateBundle(share.bundle) : null;

  return (
    <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col gap-5 px-3 py-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="rounded-xl border bg-[var(--surface)] p-4">
        <div className="bg-muted mb-8 flex size-10 items-center justify-center rounded-lg">
          <Dumbbell className="size-5" />
        </div>
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Shared workouts
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {share?.sharedBy
            ? `${share.sharedBy} sent you a workout`
            : "Someone sent you a workout"}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Add these templates to your account and start lifting.
        </p>
      </div>

      {share === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : share === null ? (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <p className="text-sm font-medium">This link isn&apos;t available</p>
          <p className="text-muted-foreground text-sm">
            Share links expire after 30 days and can be revoked by whoever
            created them. Ask for a fresh link, or import a file instead.
          </p>
          <Button asChild variant="outline">
            <Link href="/templates/import">Import a file or code</Link>
          </Button>
        </div>
      ) : !parsed?.ok ? (
        <p className="text-destructive text-sm">
          This share link is malformed and can&apos;t be imported.
        </p>
      ) : (
        <>
          <BundlePreview bundle={parsed.bundle} />

          {authLoading ? (
            <Button disabled>
              <Loader2 className="size-4 animate-spin" />
              Checking your account
            </Button>
          ) : user ? (
            <>
              <Button onClick={handleImport} disabled={importing || done}>
                {importing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : done ? (
                  <Check className="size-4" />
                ) : (
                  <Upload className="size-4" />
                )}
                {done ? "Imported" : "Add to my templates"}
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                Added as new templates — nothing you already have is changed.
              </p>
            </>
          ) : (
            <>
              <Button asChild>
                <Link
                  href={`/sign-in?returnTo=${encodeURIComponent(sharePath(token))}`}
                  prefetch={false}
                >
                  <LogIn className="size-4" />
                  Sign in to import
                </Link>
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                You&apos;ll come straight back here after signing in.
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}
