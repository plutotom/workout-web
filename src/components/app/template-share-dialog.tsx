"use client";

import { useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { Check, Copy, Download, Link2, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bundleFileName,
  describeBundle,
  encodeBundleCode,
  serializeBundle,
  shareUrl,
  toBundle,
  type WorkoutExportBundle,
} from "@/lib/workout-export";

type Props = {
  /** Omit to export every template. */
  templateIds?: Id<"workoutTemplates">[];
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
};

/**
 * Export entry point: builds the bundle on demand, then offers all three
 * transports — a share link, a `.json` file, and a self-contained code.
 */
export function TemplateShareDialog({
  templateIds,
  label = "Share",
  variant = "outline",
  size,
  className,
}: Props) {
  const convex = useConvex();
  const catalog = useExerciseCatalog();
  const createShare = useMutation(api.routes.shares.mutations.create);

  const [open, setOpen] = useState(false);
  const [bundle, setBundle] = useState<WorkoutExportBundle | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<"open" | "link" | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  // Shown on the recipient's preview page. Optional and free-text — we never
  // put the sender's email on a public page.
  const [sharedBy, setSharedBy] = useState("");

  async function handleOpen() {
    setBusy("open");
    try {
      // Fetched on click rather than subscribed: an export is a point-in-time
      // snapshot, and nobody needs a live subscription to it.
      const data = await convex.query(api.routes.templates.queries.exportData, {
        templateIds,
      });
      if (!data || data.templates.length === 0) {
        toast.error("Nothing to share yet — create a template first");
        return;
      }
      setBundle(toBundle(data, catalog));
      setLink(null);
      setCopied(null);
      setOpen(true);
    } catch {
      toast.error("Couldn't build the export");
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, which: "link" | "code") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
      toast.success(which === "link" ? "Link copied" : "Code copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  }

  async function handleCreateLink() {
    if (!bundle) return;
    setBusy("link");
    try {
      const { token } = await createShare({
        bundle,
        sharedBy: sharedBy.trim() || undefined,
      });
      const url = shareUrl(window.location.origin, token);
      setLink(url);
      await copy(url, "link");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't create a share link",
      );
    } finally {
      setBusy(null);
    }
  }

  function handleDownload() {
    if (!bundle) return;
    const blob = new Blob([serializeBundle(bundle)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = bundleFileName(bundle);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleNativeShare() {
    if (!bundle || !link) return;
    if (!navigator.share) {
      await copy(link, "link");
      return;
    }
    try {
      await navigator.share({ title: "My workout templates", url: link });
    } catch {
      // The user dismissed the share sheet — nothing to report.
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={busy === "open"}
        onClick={handleOpen}
      >
        {busy === "open" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Share2 className="size-4" />
        )}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Share workouts</DialogTitle>
            <DialogDescription>
              {bundle
                ? `${describeBundle(bundle)} · weights in ${bundle.unit}`
                : null}
            </DialogDescription>
          </DialogHeader>

          {bundle ? (
            <div className="flex flex-col gap-5">
              <ul className="flex flex-col gap-1 rounded-lg border bg-[var(--surface)] p-3">
                {bundle.templates.map((template, index) => (
                  <li
                    key={`${template.name}-${index}`}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {template.name}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {template.exercises.length} exercises
                    </span>
                  </li>
                ))}
              </ul>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Send a link</h3>
                <p className="text-muted-foreground text-xs">
                  Anyone with the link can import these templates. It expires in
                  30 days and you can revoke it in Settings.
                </p>
                {link ? (
                  <div className="flex flex-col gap-2">
                    <code className="bg-muted block overflow-x-auto rounded-md px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {link}
                    </code>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => copy(link, "link")}
                      >
                        {copied === "link" ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        Copy link
                      </Button>
                      <Button className="flex-1" onClick={handleNativeShare}>
                        <Share2 className="size-4" />
                        Share
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Input
                      value={sharedBy}
                      maxLength={60}
                      placeholder="Your name (optional)"
                      aria-label="Your name, shown to whoever opens the link"
                      onChange={(event) => setSharedBy(event.target.value)}
                    />
                    <Button
                      onClick={handleCreateLink}
                      disabled={busy === "link"}
                    >
                      {busy === "link" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Link2 className="size-4" />
                      )}
                      Create share link
                    </Button>
                  </>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Or send a file / code</h3>
                <p className="text-muted-foreground text-xs">
                  Works without the link ever expiring, and imports offline.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleDownload}
                  >
                    <Download className="size-4" />
                    Download .json
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => copy(encodeBundleCode(bundle), "code")}
                  >
                    {copied === "code" ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    Copy code
                  </Button>
                </div>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
