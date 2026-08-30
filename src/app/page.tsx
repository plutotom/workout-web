import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Grayed Lift",
  description:
    "Track strength sessions in the browser — templates when you want a plan, quick start when you just want to lift.",
  openGraph: {
    title: "Grayed Lift",
    description:
      "Track strength sessions in the browser — templates when you want a plan, quick start when you just want to lift.",
  },
};

export default async function Home() {
  const { user } = await withAuth();
  if (user) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
