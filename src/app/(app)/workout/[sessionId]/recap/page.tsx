import { WorkoutRecap } from "@/components/app/workout-recap";

export default async function WorkoutRecapPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <WorkoutRecap sessionId={sessionId} />;
}
