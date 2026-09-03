import { router } from "expo-router";
import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";

import { FullScreenLoader } from "@/components/ui";

/** Old exercise insights URL → new encyclopedia detail. */
export default function LegacyExerciseInsightsRedirect() {
  const { slug, days } = useLocalSearchParams<{
    slug?: string;
    days?: string;
  }>();

  useEffect(() => {
    if (!slug) return;
    router.replace({
      pathname: "/exercises/[slug]",
      params: days ? { slug, days } : { slug },
    });
  }, [slug, days]);

  return <FullScreenLoader label="Opening exercise…" />;
}
