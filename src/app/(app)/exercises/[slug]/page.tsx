import { ExerciseDetail } from "@/components/app/exercise-detail";

export default async function ExerciseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ days?: string; from?: string }>;
}) {
  const { slug } = await params;
  const { days, from } = await searchParams;
  return (
    <ExerciseDetail
      slug={decodeURIComponent(slug)}
      daysParam={days}
      fromParam={from}
    />
  );
}
