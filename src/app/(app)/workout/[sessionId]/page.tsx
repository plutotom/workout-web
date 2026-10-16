import { WorkoutSessionView } from "@/components/app/workout-session-view";

export default async function WorkoutLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { sessionId } = await params;
  const { edit } = await searchParams;
  return (
    <WorkoutSessionView sessionId={sessionId} startInEdit={edit === "1"} />
  );
}
