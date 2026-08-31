import { Text, View } from "react-native";

import {
  formatHealthSegmentRows,
  type HealthWorkoutSegment,
} from "@shared/health-summary";
import { colors, radius } from "@/theme";

export function HealthSegmentList({
  segments,
  unit = "lb",
}: {
  segments: HealthWorkoutSegment[] | null | undefined;
  unit?: "lb" | "kg";
}) {
  const rows = formatHealthSegmentRows(segments, unit);
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row) => (
        <View
          key={row.key}
          style={{
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderRadius: radius.md,
            backgroundColor: colors.surface2,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              color: row.isTransition ? colors.dim : colors.text,
              fontSize: 15,
              fontWeight: row.isTransition ? "500" : "700",
              flexShrink: 1,
            }}
          >
            {row.name}
          </Text>
          <Text
            style={{
              color: colors.dim,
              fontSize: 13,
              fontVariant: ["tabular-nums"],
            }}
          >
            {row.facts}
          </Text>
        </View>
      ))}
    </View>
  );
}
