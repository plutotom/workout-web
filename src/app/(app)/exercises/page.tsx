import { ExercisesList } from "@/components/app/exercises-list";

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ custom?: string }>;
}) {
  const { custom } = await searchParams;
  return <ExercisesList customOnly={custom === "1"} />;
}
