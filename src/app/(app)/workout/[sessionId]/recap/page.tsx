import { WorkoutRecap } from "@/components/app/workout-recap";

export default async function WorkoutRecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { sessionId } = await params;
  const { step } = await searchParams;
  return <WorkoutRecap sessionId={sessionId} stepParam={step} />;
}
