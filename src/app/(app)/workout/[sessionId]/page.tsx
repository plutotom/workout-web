import { WorkoutSessionView } from "@/components/app/workout-session-view";

export default async function WorkoutLogPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <WorkoutSessionView sessionId={sessionId} />;
}
