import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { ExerciseCatalog, MuscleGroup } from "@shared/exercises";
import { MUSCLE_GROUPS } from "@shared/exercises";
import { colors } from "@/theme";

export type MuscleSegment = {
  id: MuscleGroup;
  label: string;
  value: number;
  pct: number;
};

export function buildMuscleSegments(
  exercises: { slug: string; sets: number }[],
  catalog: ExerciseCatalog,
) {
  const totals = new Map<MuscleGroup, number>();
  for (const exercise of exercises) {
    const group = catalog.category(exercise.slug);
    if (group) totals.set(group, (totals.get(group) ?? 0) + exercise.sets);
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return MUSCLE_GROUPS.map((group) => ({
    ...group,
    value: totals.get(group.id) ?? 0,
    pct: total ? Math.round(((totals.get(group.id) ?? 0) / total) * 100) : 0,
  })).filter((segment) => segment.value > 0);
}

const shades = [
  colors.g1,
  colors.g2,
  colors.g3,
  colors.g4,
  colors.faint,
  colors.surface2,
];

export function MuscleBand({
  segments,
  legend = false,
}: {
  segments: MuscleSegment[];
  legend?: boolean;
}) {
  return (
    <View style={{ gap: 9 }}>
      <View
        style={{
          height: 8,
          borderRadius: 99,
          overflow: "hidden",
          flexDirection: "row",
          backgroundColor: colors.surface2,
        }}
      >
        {segments.length ? (
          segments.map((segment, index) => (
            <View
              key={segment.id}
              style={{
                flexGrow: Math.max(segment.pct, 4),
                flexBasis: 0,
                backgroundColor: shades[index % shades.length],
              }}
            />
          ))
        ) : (
          <View
            style={{ flex: 1, backgroundColor: colors.faint, opacity: 0.3 }}
          />
        )}
      </View>
      {legend && segments.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {segments.map((segment, index) => (
            <View
              key={segment.id}
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: shades[index % shades.length],
                }}
              />
              <Text style={{ color: colors.dim, fontSize: 10 }}>
                {segment.label} {segment.pct}%
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ProgressRing({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const circumference = 2 * Math.PI * 18;
  const progress = Math.max(0, Math.min(1, value));
  return (
    <View
      style={{
        width: 58,
        height: 58,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        width={58}
        height={58}
        viewBox="0 0 48 48"
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke={colors.surface2}
          strokeWidth="6"
        />
        <Circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke={colors.action}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </Svg>
      <Text
        style={{
          position: "absolute",
          color: colors.text,
          fontSize: 11,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const usable = values.length ? values : [0, 0, 0, 0, 0, 0, 0];
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const range = max - min || 1;
  const path = usable
    .map((value, index) => {
      const x =
        2 + (usable.length === 1 ? 0 : (index / (usable.length - 1)) * 116);
      const y = 36 - ((value - min) / range) * 32;
      return `${index ? "L" : "M"}${x} ${y}`;
    })
    .join(" ");
  return (
    <View style={{ height: 46 }}>
      <Svg width="100%" height="100%" viewBox="0 0 120 40">
        <Path
          d={path}
          fill="none"
          stroke={colors.text}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
