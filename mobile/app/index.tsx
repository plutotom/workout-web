import { Redirect } from "expo-router";

import { FullScreenLoader } from "@/components/ui";
import { useMobileAuth } from "@/auth/auth-provider";

export default function Index() {
  const { loading, canUseApp } = useMobileAuth();
  if (loading) return <FullScreenLoader label="Opening Workout…" />;
  // Prefer public paths (no group segments) — more reliable with Expo Router.
  return <Redirect href={canUseApp ? "/dashboard" : "/sign-in"} />;
}
