import { InsightsSessions } from "@/components/app/insights/insights-sessions";

export default async function InsightsSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  return <InsightsSessions daysParam={days} />;
}
