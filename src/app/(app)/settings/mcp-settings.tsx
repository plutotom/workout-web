"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Id } from "@backend/dataModel";
import { api } from "@backend/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatWhen(ts: number | undefined) {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString();
}

export function McpSettings() {
  const keys = useQuery(api.routes.mcp.keys.list);
  const createKey = useMutation(api.routes.mcp.keys.create);
  const revokeKey = useMutation(api.routes.mcp.keys.revoke);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<Id<"mcpApiKeys"> | null>(null);

  const loading = keys === undefined;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-app.vercel.app";

  const cursorConfig = newKey
    ? JSON.stringify(
        {
          mcpServers: {
            "workout-web": {
              url: `${origin}/api/mcp`,
              headers: { Authorization: `Bearer ${newKey}` },
            },
          },
        },
        null,
        2,
      )
    : null;

  async function handleCreate() {
    setCreating(true);
    try {
      const result = await createKey({ name: name.trim() || "API key" });
      setNewKey(result.rawKey);
      setName("");
      toast.success("API key created");
    } catch {
      toast.error("Couldn't create API key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: Id<"mcpApiKeys">) {
    setRevokingId(keyId);
    try {
      await revokeKey({ keyId });
      toast.success("API key revoked");
    } catch {
      toast.error("Couldn't revoke API key");
    } finally {
      setRevokingId(null);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}`);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MCP access</CardTitle>
          <CardDescription>
            Connect Cursor or other MCP clients to manage templates and log
            workouts. Keys are shown once when created.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="mcp-key-name">New key name</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="mcp-key-name"
                placeholder="Cursor laptop"
                value={name}
                disabled={loading || creating}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                type="button"
                className="shrink-0 sm:w-auto"
                disabled={loading || creating}
                onClick={handleCreate}
              >
                <KeyRound className="size-4" />
                Create
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Active keys</Label>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : keys.length === 0 ? (
              <p className="text-muted-foreground text-sm">No API keys yet.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {keys.map((k) => (
                  <li
                    key={k._id}
                    className="flex items-start justify-between gap-3 px-3 py-2.5 sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{k.name}</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        <span className="block sm:inline">{k.keyPrefix}…</span>
                        <span className="hidden sm:inline"> · </span>
                        <span className="block sm:inline">
                          Created {formatWhen(k.createdAt)}
                        </span>
                        <span className="hidden sm:inline"> · </span>
                        <span className="block sm:inline">
                          Last used {formatWhen(k.lastUsedAt)}
                        </span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive shrink-0"
                      disabled={revokingId === k._id}
                      onClick={() => handleRevoke(k._id)}
                      aria-label={`Revoke ${k.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-muted-foreground text-xs">
            MCP endpoint:{" "}
            <code className="text-foreground break-all">{origin}/api/mcp</code>
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={newKey !== null}
        onOpenChange={(open) => {
          if (!open) setNewKey(null);
        }}
      >
        <DialogContent className="gap-5">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription>
              This key is shown only once. Copy it now — you won&apos;t be able
              to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>API key</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0"
                  onClick={() => newKey && copyText(newKey, "API key")}
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
              <Input
                readOnly
                value={newKey ?? ""}
                className="font-mono text-xs break-all"
              />
            </div>
            {cursorConfig ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Cursor config</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={() => copyText(cursorConfig, "Cursor config")}
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                </div>
                <pre className="bg-muted max-h-40 overflow-auto overscroll-contain rounded-md p-3 font-mono text-[11px] leading-relaxed break-all sm:max-h-48 sm:text-xs">
                  {cursorConfig}
                </pre>
              </div>
            ) : null}
          </div>
          <DialogFooter className="pt-1">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => setNewKey(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
