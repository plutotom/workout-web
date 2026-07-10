import { ExerciseInsights } from "@/components/app/insights/exercise-insights";

export default async function ExerciseInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ days?: string; from?: string }>;
}) {
  const { slug } = await params;
  const { days, from } = await searchParams;
  return <ExerciseInsights slug={slug} daysParam={days} fromParam={from} />;
}
