import { InsightsLifts } from "@/components/app/insights/insights-lifts";

export default async function InsightsLiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; group?: string }>;
}) {
  const { days, group } = await searchParams;
  return <InsightsLifts daysParam={days} groupParam={group} />;
}
