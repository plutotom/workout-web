"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { hapticSuccess } from "@/lib/haptics";

type TemplateData =
  | {
      exercises: { slug: string; sets: { weight: number; reps: number }[] }[];
    }
  | null
  | undefined;

type FinishFlowSet = { weight: number; reps: number; completed: boolean };

type FinishFlowSession = {
  templateId: Id<"workoutTemplates"> | null;
  templateName: string;
  exercises: { slug: string; sets: FinishFlowSet[] }[];
};

/**
 * True when the sets logged this session differ from the template's presets,
 * for any exercise still on the template. Uses all logged rows (the checkmark
 * is a progress aid, not a gate), matching how the sync writes them back.
 */
function templateDiffersFromSession(
  exercises: { slug: string; sets: FinishFlowSet[] }[],
  template: TemplateData,
): boolean {
  if (!template) return false;

  const sessionSlugs = exercises.map((e) => e.slug);
  const templateSlugs = template.exercises.map((e) => e.slug);
  if (sessionSlugs.length !== templateSlugs.length) return true;
  if (sessionSlugs.some((slug, i) => slug !== templateSlugs[i])) return true;

  const bySlug = new Map(template.exercises.map((e) => [e.slug, e.sets]));
  for (const ex of exercises) {
    const current = bySlug.get(ex.slug);
    if (!current) continue;
    if (
      ex.sets.length !== current.length ||
      ex.sets.some(
        (s, i) => s.weight !== current[i].weight || s.reps !== current[i].reps,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The finish/discard flow shared by the List and Focus active-workout views:
 * empty and unchecked-sets confirmations, template sync, and the save-as-
 * template prompt for blank sessions. Render `dialogs` somewhere in the tree.
 */
export function useWorkoutFinishFlow({
  sessionId,
  session,
}: {
  sessionId: string;
  session: FinishFlowSession | null | undefined;
}): {
  finishing: boolean;
  /** True while a post-finish dialog (sync / save-as-template) is open. */
  awaitingPostFinish: boolean;
  handleFinish: () => void;
  dialogs: ReactNode;
} {
  const router = useRouter();
  const template = useQuery(
    api.routes.templates.queries.get,
    session?.templateId ? { templateId: session.templateId } : "skip",
  );
  const finish = useMutation(api.routes.workouts.mutations.finish);
  const abandon = useMutation(api.routes.workouts.mutations.abandon);
  const syncFromSession = useMutation(
    api.routes.templates.mutations.syncFromSession,
  );
  const createFromSession = useMutation(
    api.routes.templates.mutations.createFromSession,
  );

  const [finishing, setFinishing] = useState(false);
  // True from just before finish() until a post-finish dialog is open — closes
  // the race where Focus would unmount between mutation settle and setState.
  const [postFinishPending, setPostFinishPending] = useState(false);
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const savePromptResolved = useRef(false);

  const isBlankSession = session ? session.templateId === null : true;
  const exerciseCountAtFinish = session?.exercises.length ?? 0;
  const hasLoggedWork =
    session?.exercises.some((ex) =>
      ex.sets.some((s) => s.completed && s.reps > 0),
    ) ?? false;
  // undefined = template still loading; null = blank / missing; object = ready
  const templateReady = isBlankSession || template !== undefined;
  const templateDiffers =
    !isBlankSession &&
    !!session &&
    template !== undefined &&
    templateDiffersFromSession(session.exercises, template);
  const hasUncheckedSets =
    session?.exercises.some((ex) => ex.sets.some((s) => !s.completed)) ?? false;
  const templateName = session?.templateName ?? "";
  const awaitingPostFinish = postFinishPending || syncOpen || saveTemplateOpen;

  // Finish: empty / no logged work → discard; wait for template; unchecked confirm.
  // Quick start (blank): after a real finish → save-as-template. Template-based:
  // after a real finish → update-template when sets/order differ.
  function handleFinish() {
    if (!session) return;
    if (finishing || awaitingPostFinish) return;
    if (exerciseCountAtFinish === 0 || !hasLoggedWork) {
      setEmptyOpen(true);
      return;
    }
    if (!templateReady) {
      toast.message("Still loading template…");
      return;
    }
    if (hasUncheckedSets) {
      setIncompleteOpen(true);
      return;
    }
    void finishWorkout();
  }

  function defaultTemplateName() {
    return new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  async function finishWorkout() {
    if (finishing || postFinishPending || syncOpen || saveTemplateOpen) return;
    setIncompleteOpen(false);
    setFinishing(true);
    const willPromptSave = isBlankSession && exerciseCountAtFinish > 0;
    const willPromptSync = !isBlankSession && templateDiffers;
    if (willPromptSave || willPromptSync) setPostFinishPending(true);
    try {
      await finish({ sessionId: sessionId as Id<"workoutSessions"> });
      hapticSuccess();
      if (willPromptSave) {
        savePromptResolved.current = false;
        setSaveTemplateName(defaultTemplateName());
        setSaveTemplateOpen(true);
        setPostFinishPending(false);
        setFinishing(false);
        return;
      }
      // Offer to push today's numbers back to the template, but only if they
      // actually differ.
      if (willPromptSync) {
        setSyncOpen(true);
        setPostFinishPending(false);
        setFinishing(false);
        return;
      }
      toast.success("Workout finished");
      setPostFinishPending(true);
      router.push(`/workout/${sessionId}/recap`);
    } catch {
      setPostFinishPending(false);
      setFinishing(false);
      toast.error("Couldn't finish workout");
    }
  }

  async function discardWorkout() {
    if (finishing) return;
    setIncompleteOpen(false);
    setEmptyOpen(false);
    setFinishing(true);
    try {
      await abandon({ sessionId: sessionId as Id<"workoutSessions"> });
      toast.success("Workout discarded");
      router.push("/dashboard");
    } catch {
      setFinishing(false);
      toast.error("Couldn't discard workout");
    }
  }

  function goToRecap(message: string) {
    // Hold Focus's post-finish shell until the route change — closing the
    // dialog alone would briefly mount WorkoutLog before /recap loads.
    setPostFinishPending(true);
    setSyncOpen(false);
    setSaveTemplateOpen(false);
    toast.success(message);
    router.push(`/workout/${sessionId}/recap`);
  }

  async function handleSync(update: boolean) {
    if (update) {
      try {
        await syncFromSession({
          sessionId: sessionId as Id<"workoutSessions">,
        });
        goToRecap("Template updated");
      } catch {
        toast.error("Couldn't update template");
      }
      return;
    }
    goToRecap("Workout finished");
  }

  async function handleSaveTemplate(save: boolean) {
    if (savePromptResolved.current) return;
    savePromptResolved.current = true;

    if (!save) {
      goToRecap("Workout finished");
      return;
    }

    const name = saveTemplateName.trim();
    if (!name) {
      savePromptResolved.current = false;
      toast.error("Give your template a name");
      return;
    }

    setSavingTemplate(true);
    try {
      await createFromSession({
        sessionId: sessionId as Id<"workoutSessions">,
        name,
      });
      goToRecap("Template saved");
    } catch {
      savePromptResolved.current = false;
      setSavingTemplate(false);
      toast.error("Couldn't save template");
    }
  }

  const dialogs = (
    <>
      <Dialog open={incompleteOpen} onOpenChange={setIncompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish this workout?</DialogTitle>
            <DialogDescription>
              Some sets aren&apos;t checked off. Save this workout anyway, or
              discard it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button onClick={() => void finishWorkout()}>Save workout</Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => void discardWorkout()}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emptyOpen} onOpenChange={setEmptyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nothing logged</DialogTitle>
            <DialogDescription>
              {exerciseCountAtFinish === 0
                ? "This workout has no exercises. Discard it so it doesn't count toward your week?"
                : "No sets are checked off with reps. Discard it so it doesn't count toward your week?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={finishing}
              onClick={() => void discardWorkout()}
            >
              Discard
            </Button>
            <Button
              variant="ghost"
              disabled={finishing}
              onClick={() => setEmptyOpen(false)}
            >
              Keep going
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update template?</DialogTitle>
            <DialogDescription>
              Update {templateName} to match the exercises, order, and weights
              you just logged?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button onClick={() => handleSync(true)}>Update template</Button>
            <Button variant="outline" onClick={() => handleSync(false)}>
              Keep as is
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={saveTemplateOpen}
        onOpenChange={(open) => {
          if (!open && !savingTemplate) {
            void handleSaveTemplate(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template?</DialogTitle>
            <DialogDescription>
              Keep this workout so you can start it again next time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <label htmlFor="save-template-name" className="text-sm font-medium">
              Template name
            </label>
            <Input
              id="save-template-name"
              value={saveTemplateName}
              onChange={(e) => setSaveTemplateName(e.target.value)}
              placeholder="e.g. Push day"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveTemplate(true);
              }}
            />
          </div>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button
              disabled={savingTemplate || !saveTemplateName.trim()}
              onClick={() => void handleSaveTemplate(true)}
            >
              {savingTemplate ? "Saving…" : "Save template"}
            </Button>
            <Button
              variant="outline"
              disabled={savingTemplate}
              onClick={() => void handleSaveTemplate(false)}
            >
              No thanks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    finishing,
    awaitingPostFinish,
    handleFinish,
    dialogs,
  };
}
