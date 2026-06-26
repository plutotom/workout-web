"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Dumbbell, Play } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  const active = useQuery(api.routes.workouts.queries.active);

  return (
    <div className="flex flex-col gap-6">
      {active ? (
        <Card className="border-success/40 bg-success/5">
          <CardHeader>
            <CardTitle className="text-base">Workout in progress</CardTitle>
            <CardDescription>{active.templateName}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={`/workout/${active._id}`}>
                <Play className="size-4" />
                Continue workout
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sessions</CardTitle>
          <CardDescription>
            Your finished workouts show up here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No workouts yet"
            description="Create a template, then start a workout to see history."
          />
        </CardContent>
      </Card>

      <Button asChild variant="secondary" size="lg" className="w-full">
        <Link href="/templates">
          <Dumbbell className="size-5" />
          Templates
        </Link>
      </Button>
    </div>
  );
}
