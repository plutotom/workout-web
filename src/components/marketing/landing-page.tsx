"use client";

import Link from "next/link";

import { GeneratingLoader } from "@/components/app/generating-loader";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  {
    title: "Templates",
    body: "Build a plan once. Start it fast every time you train.",
  },
  {
    title: "Log sets",
    body: "Weight, reps, done. Stay in the lift without fuss.",
  },
  {
    title: "Insights",
    body: "Volume, streaks, and top lifts show up as you stack sessions.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="bg-background text-foreground flex min-h-full flex-col">
      <section className="relative flex min-h-[100dvh] flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 55% at 50% -10%, rgba(243,243,245,0.12), transparent 60%), radial-gradient(ellipse 70% 40% at 80% 90%, rgba(243,243,245,0.05), transparent 55%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 80% 70% at 50% 40%, black, transparent)",
          }}
        />

        <header className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-6">
          <p className="text-sm font-semibold tracking-tight">Grayed Lift</p>
          <Button asChild variant="ghost" size="sm" className="min-h-11 px-3">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-between px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6 text-center">
            <div className="animate-rise-in flex flex-col gap-3">
              <p className="text-5xl font-semibold tracking-tight sm:text-6xl">
                Grayed Lift
              </p>
              <h1 className="text-2xl font-medium tracking-tight text-balance sm:text-3xl">
                Lift. Log. Repeat.
              </h1>
              <p className="text-muted-foreground mx-auto max-w-sm text-base leading-relaxed text-pretty">
                Track strength sessions in the browser — templates when you want
                a plan, quick start when you just want to lift.
              </p>
            </div>

            <div
              className="animate-rise-in w-full"
              style={{ animationDelay: "80ms" }}
              aria-hidden
            >
              <GeneratingLoader forceIndex={0} />
            </div>

            <div
              className="animate-rise-in flex w-full max-w-xs flex-col gap-2"
              style={{ animationDelay: "140ms" }}
            >
              <Button asChild size="lg" className="min-h-12 w-full text-base">
                <Link href="/sign-up">Get started</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="min-h-12 w-full text-base"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-border/60 border-t px-4 py-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-12">
          {SECTIONS.map((section, index) => (
            <div
              key={section.title}
              className="animate-rise-in flex flex-col gap-2"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                {section.title}
              </h2>
              <p className="text-muted-foreground max-w-md text-base leading-relaxed">
                {section.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border/60 border-t px-4 py-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Ready when you are
          </h2>
          <p className="text-muted-foreground max-w-md text-base leading-relaxed">
            Sign up, pick a path, and log your first set.
          </p>
          <Button
            asChild
            size="lg"
            className="min-h-12 w-full max-w-xs text-base"
          >
            <Link href="/sign-up">Create account</Link>
          </Button>
        </div>
      </section>

      <footer className="text-muted-foreground border-border/60 border-t px-4 py-8 text-sm sm:px-6">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-4">
          <p className="font-medium text-foreground">Grayed Lift</p>
          <p>Track workouts in the browser.</p>
        </div>
      </footer>
    </div>
  );
}
