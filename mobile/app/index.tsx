import { Redirect } from "expo-router";

import { FullScreenLoader } from "@/components/ui";
import { useMobileAuth } from "@/auth/auth-provider";

export default function Index() {
  const { loading, user } = useMobileAuth();
  if (loading) return <FullScreenLoader label="Opening Workout…" />;
  return <Redirect href={user ? "/(tabs)/dashboard" : "/(auth)/sign-in"} />;
}
