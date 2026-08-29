"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { Check, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import { BundlePreview } from "@/components/app/bundle-preview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseImportedFile } from "@/lib/workout-backup";
import { type WorkoutExportBundle } from "@/lib/workout-export";

/**
 * Import from a pasted code or a `.json` file. The bundle is parsed and shown
 * before anything is written — an import always adds, never overwrites, but the
 * user should still see what they are about to get.
 */
export function TemplateImportPanel() {
  const router = useRouter();
  const importBundle = useMutation(api.routes.templates.mutations.importBundle);
  const fileInput = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [bundle, setBundle] = useState<WorkoutExportBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  function preview(input: string) {
    const result = parseImportedFile(input);
    if (!result.ok) {
      setBundle(null);
      setError(result.error);
      return;
    }
    setError(null);
    setBundle(result.bundle);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      setText("");
      preview(await file.text());
    } catch {
      setError("Couldn't read that file");
    }
  }

  async function handleImport() {
    if (!bundle) return;
    setImporting(true);
    try {
      const result = await importBundle({ bundle });
      setDone(true);
      toast.success(
        result.templatesImported === 1
          ? `Imported "${result.names[0]}"`
          : `Imported ${result.templatesImported} templates`,
      );
      router.push("/templates");
      router.refresh();
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Couldn't import that export",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          onClick={() => fileInput.current?.click()}
          className="w-full"
        >
          <FileUp className="size-4" />
          Choose a .json file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            // Reset so picking the same file twice still fires a change event.
            event.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="import-code" className="text-sm font-medium">
          Or paste a share code
        </label>
        <Textarea
          id="import-code"
          value={text}
          rows={4}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="WKT1-…"
          className="font-mono text-xs"
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (next.trim()) preview(next);
            else {
              setBundle(null);
              setError(null);
            }
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {bundle ? (
        <>
          <BundlePreview bundle={bundle} />
          <p className="text-muted-foreground text-xs">
            These are added as new templates — nothing you already have is
            changed or replaced.
          </p>
          <Button onClick={handleImport} disabled={importing || done}>
            {importing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : done ? (
              <Check className="size-4" />
            ) : (
              <Upload className="size-4" />
            )}
            {done ? "Imported" : "Import"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
