import { redirect } from "next/navigation";

import { exerciseDetailPath } from "@/lib/exercise-browser";

export default async function LegacyExerciseInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ days?: string; from?: string }>;
}) {
  const { slug } = await params;
  const { days, from } = await searchParams;
  redirect(
    exerciseDetailPath(decodeURIComponent(slug), {
      days,
      from,
    }),
  );
}
