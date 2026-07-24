"use client";

import { toast } from "sonner";

import {
  GeneratingLoader,
  LOADER_NAMES,
} from "@/components/app/generating-loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DevUiPreview() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">UI preview</h1>
        <p className="text-muted-foreground text-sm">
          Dark-only design system — primitives at 375px gym width.
        </p>
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
        </div>
        <Button className="w-full" size="lg">
          Full-width tap target
        </Button>
      </Section>

      <Section title="Card">
        <Card>
          <CardHeader>
            <CardTitle>Upper Body</CardTitle>
            <CardDescription>Bench · Squat · Deadlift</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline">
                Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Last session: 3 days ago
          </CardContent>
          <CardFooter>
            <Button className="w-full">Start workout</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-2">
          <Label htmlFor="weight">Weight (lb)</Label>
          <Input id="weight" inputMode="numeric" placeholder="135" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">Template name</Label>
          <Input id="name" placeholder="Push Day" />
        </div>
        <Input aria-invalid placeholder="Invalid state" />
      </Section>

      <Section title="Separator">
        <div className="text-sm">
          <p>Above</p>
          <Separator className="my-3" />
          <p>Below</p>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="weight">
          <TabsList className="w-full">
            <TabsTrigger value="weight">Weight → Plates</TabsTrigger>
            <TabsTrigger value="plates">Plates → Weight</TabsTrigger>
          </TabsList>
          <TabsContent
            value="weight"
            className="text-muted-foreground pt-3 text-sm"
          >
            Enter a target weight to solve plates per side.
          </TabsContent>
          <TabsContent
            value="plates"
            className="text-muted-foreground pt-3 text-sm"
          >
            Tap plates to compute total bar weight.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Overlays + Toast">
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abandon current workout?</DialogTitle>
                <DialogDescription>
                  You have a workout in progress. Starting a new one will
                  abandon it.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive">Abandon</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Sheet</Button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>Add exercise</SheetTitle>
                <SheetDescription>Pick a lift to add.</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-2 px-4">
                <Button variant="secondary">Bench Press</Button>
                <Button variant="secondary">Squat</Button>
                <Button variant="secondary">Deadlift</Button>
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="ghost">Close</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Button onClick={() => toast.success("Settings saved")}>Toast</Button>
        </div>
      </Section>

      <Section title="Completed-set accent">
        <div className="border-success/40 bg-success/10 flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span>Set 1 · 135 lb × 5</span>
          <span className="text-success font-medium">Done</span>
        </div>
      </Section>

      <Section title="AI generation loaders">
        <p className="text-muted-foreground text-sm">
          One of these is picked at random each time a generation starts.
          Remount to re-roll.
        </p>
        <div className="flex flex-col gap-2">
          <div className="bg-card rounded-lg border p-2">
            <GeneratingLoader label="Random pick" />
          </div>
          {LOADER_NAMES.map((name, i) => (
            <div key={name} className="bg-card rounded-lg border p-2">
              <p className="text-muted-foreground px-2 pt-1 font-mono text-[10px] tracking-[0.14em] uppercase">
                {name}
              </p>
              <GeneratingLoader forceIndex={i} />
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
