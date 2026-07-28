import type { Metadata } from "next";

import { SharedTemplatesView } from "@/components/app/shared-templates-view";

export const metadata: Metadata = {
  title: "Shared workouts",
  // A share link is a private capability URL — keep it out of search results.
  robots: { index: false, follow: false },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedTemplatesView token={token} />;
}
