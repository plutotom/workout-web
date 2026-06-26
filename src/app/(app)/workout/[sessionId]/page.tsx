import { WorkoutLog } from "@/components/app/workout-log";

export default async function WorkoutLogPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <WorkoutLog sessionId={sessionId} />;
}
