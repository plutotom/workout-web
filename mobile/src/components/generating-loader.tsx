import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

import { colors } from "@/theme";

/**
 * Native counterparts to the web `GeneratingLoader`. CSS keyframes don't cross
 * over to React Native, so each scene is redrawn with react-native-svg and
 * animated by transforming wrapper views. Every loader is driven by one linear
 * 0→1 clock and reads its keyframes out of `interpolate`, which keeps the
 * timing declarative in the same way the stylesheet did.
 */

const STAGE_W = 120;
const STAGE_H = 126;

/** Absolutely stacked layers so parts of a scene can animate independently. */
const { layer } = StyleSheet.create({
  layer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
});

function useClock(durationMs: number, enabled: boolean): SharedValue<number> {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!enabled) {
      t.value = 0;
      return;
    }
    t.value = 0;
    t.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [durationMs, enabled, t]);
  return t;
}

/** True when the OS asks for reduced motion; loaders then render a still pose. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduce(value);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

function BellSwing({ animate }: { animate: boolean }) {
  const t = useClock(1800, animate);

  const swing = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(t.value, [0, 0.25, 0.5, 0.75, 1], [-26, 0, 26, 0, -26])}deg`,
      },
    ],
  }));

  const shadow = useAnimatedStyle(() => ({
    opacity: interpolate(
      t.value,
      [0, 0.25, 0.5, 0.75, 1],
      [0.42, 0.9, 0.42, 0.9, 0.42],
    ),
    transform: [
      {
        translateX: interpolate(
          t.value,
          [0, 0.25, 0.5, 0.75, 1],
          [21, 0, -21, 0, 21],
        ),
      },
    ],
  }));

  return (
    <View style={styles.stage}>
      <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
        <Line
          x1={14}
          y1={112}
          x2={106}
          y2={112}
          stroke={colors.line}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>

      <Animated.View style={[layer, shadow]}>
        <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
          <Ellipse
            cx={60}
            cy={115}
            rx={25}
            ry={3}
            fill="rgba(255,255,255,0.1)"
          />
        </Svg>
      </Animated.View>

      {/* Pivots at the hook so the bell arcs rather than spinning in place. */}
      <Animated.View style={[layer, { transformOrigin: "50% 28%" }, swing]}>
        <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
          <Path
            d="M45 62 Q45 36 60 36 Q75 36 75 62"
            fill="none"
            stroke={colors.g3}
            strokeWidth={9}
            strokeLinecap="round"
          />
          <Rect
            x={49}
            y={52}
            width={22}
            height={16}
            rx={5}
            fill={colors.text}
          />
          <Circle cx={60} cy={84} r={28} fill={colors.text} />
          <Circle cx={50} cy={80} r={4.5} fill={colors.bg} />
          <Circle cx={70} cy={80} r={4.5} fill={colors.bg} />
          <Path
            d="M53 92 Q60 97 67 92"
            fill="none"
            stroke={colors.bg}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.6}
          />
        </Svg>
      </Animated.View>

      <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
        <Rect x={51} y={29} width={18} height={13} rx={6} fill={colors.g4} />
      </Svg>
    </View>
  );
}

function ChunkPress({ animate }: { animate: boolean }) {
  const t = useClock(2200, animate);

  const bodyStyle = useAnimatedStyle(() => {
    const sx = interpolate(
      t.value,
      [0, 0.14, 0.3, 0.44, 0.66, 0.78, 1],
      [1, 1.028, 0.993, 0.989, 1, 1.012, 1],
    );
    const sy = interpolate(
      t.value,
      [0, 0.14, 0.3, 0.44, 0.66, 0.78, 1],
      [1, 0.93, 1.02, 1.03, 1, 0.97, 1],
    );
    return { transform: [{ scaleX: sx }, { scaleY: sy }] };
  });

  const upperStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          t.value,
          [0, 0.14, 0.3, 0.44, 0.66, 0.78, 1],
          [0, 2.38, -0.68, -1.02, 0, 1.36, 0],
        ),
      },
    ],
  }));

  const barStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          t.value,
          [0, 0.16, 0.5, 0.72, 1],
          [0, 7, -13, 3, 0],
        ),
      },
    ],
  }));

  return (
    <View style={styles.stage}>
      <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
        <Line
          x1={14}
          y1={112}
          x2={106}
          y2={112}
          stroke={colors.line}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Ellipse cx={60} cy={115} rx={36} ry={3} fill="rgba(255,255,255,0.1)" />
      </Svg>

      {/* Squashes from the feet, the way a lifter compresses under load. */}
      <Animated.View style={[layer, { transformOrigin: "50% 89%" }, bodyStyle]}>
        <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
          <Rect
            x={22}
            y={58}
            width={76}
            height={54}
            rx={20}
            fill={colors.text}
          />
        </Svg>
      </Animated.View>

      <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
        <Circle cx={45} cy={80} r={4.5} fill={colors.bg} />
        <Circle cx={75} cy={80} r={4.5} fill={colors.bg} />
        <Rect
          x={52}
          y={93}
          width={16}
          height={3.5}
          rx={1.75}
          fill={colors.bg}
          opacity={0.55}
        />
      </Svg>

      <Animated.View style={[layer, upperStyle]}>
        <Animated.View style={[layer, barStyle]}>
          <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
            <Rect
              x={13}
              y={44}
              width={11}
              height={34}
              rx={5.5}
              fill={colors.g3}
            />
            <Rect
              x={96}
              y={44}
              width={11}
              height={34}
              rx={5.5}
              fill={colors.g3}
            />
            <Rect
              x={16}
              y={41}
              width={88}
              height={5}
              rx={2.5}
              fill={colors.g2}
            />
            <Rect
              x={10}
              y={35}
              width={7}
              height={17}
              rx={2}
              fill={colors.surface2}
              stroke="rgba(255,255,255,0.24)"
            />
            <Rect
              x={103}
              y={35}
              width={7}
              height={17}
              rx={2}
              fill={colors.surface2}
              stroke="rgba(255,255,255,0.24)"
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Plate geometry, innermost first, mirrored on both sleeves. */
const PLATES = [
  { offset: 80, height: 75, y: 27.5 },
  { offset: 65, height: 59, y: 35.5 },
  { offset: 52, height: 43, y: 43.5 },
] as const;

function LoadingTheBar({ animate }: { animate: boolean }) {
  const t = useClock(3200, animate);

  const liftStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          t.value,
          [0, 0.4, 0.5, 0.6, 1],
          [0, 0, -9, 0, 0],
        ),
      },
    ],
  }));

  return (
    <View style={styles.stage}>
      <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
        <Ellipse
          cx={60}
          cy={121}
          rx={30}
          ry={4}
          fill="rgba(255,255,255,0.09)"
        />
      </Svg>

      <Animated.View style={[layer, liftStyle]}>
        <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
          <Rect x={30} y={62} width={60} height={6} rx={3} fill={colors.g2} />
          <Rect x={12} y={62} width={20} height={6} rx={3} fill={colors.g3} />
          <Rect x={88} y={62} width={20} height={6} rx={3} fill={colors.g3} />
          {/* Knurling: one dashed stroke is cheaper than a row of rects. */}
          <Line
            x1={44}
            y1={65}
            x2={76}
            y2={65}
            stroke="rgba(12,12,14,0.5)"
            strokeWidth={6}
            strokeDasharray="1 3"
          />
          <Rect x={28} y={55} width={4} height={20} rx={2} fill={colors.g3} />
          <Rect x={88} y={55} width={4} height={20} rx={2} fill={colors.g3} />
        </Svg>

        {PLATES.map((plate, i) =>
          ([-1, 1] as const).map((side) => (
            <Plate
              key={`${i}-${side}`}
              clock={t}
              index={i}
              side={side}
              {...plate}
            />
          )),
        )}
      </Animated.View>
    </View>
  );
}

function Plate({
  clock,
  index,
  side,
  offset,
  height,
  y,
}: {
  clock: SharedValue<number>;
  index: number;
  side: -1 | 1;
  offset: number;
  height: number;
  y: number;
}) {
  // Outer plates load last and strip first, so the bar fills from the inside.
  const inStart = 0.05 + index * 0.08;
  const inEnd = inStart + 0.14;
  const outStart = 0.6 + (PLATES.length - 1 - index) * 0.08;
  const outEnd = outStart + 0.14;
  const parked = side * 78;

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      clock.value,
      [0, inStart, inStart + 0.04, outEnd - 0.04, outEnd, 1],
      [0, 0, 1, 1, 0, 0],
    ),
    transform: [
      {
        translateX: interpolate(
          clock.value,
          [0, inStart, inEnd, outStart, outEnd, 1],
          [parked, parked, 0, 0, parked, parked],
        ),
      },
    ],
  }));

  // Mirror the innermost-first geometry onto whichever sleeve this plate is on.
  const x = side === -1 ? offset : STAGE_W - offset - 12;

  return (
    <Animated.View style={[layer, style]}>
      <Svg style={layer} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
        <G>
          <Rect
            x={x}
            y={y}
            width={12}
            height={height}
            rx={3}
            fill={colors.surface2}
            stroke="rgba(255,255,255,0.22)"
          />
        </G>
      </Svg>
    </Animated.View>
  );
}

const LOADERS = [LoadingTheBar, BellSwing, ChunkPress];

/** Display names, index-aligned with the pool. */
export const LOADER_NAMES = [
  "Loading the Bar",
  "Bell swing",
  "Chunk press",
] as const;

export const LOADER_COUNT = LOADERS.length;

/**
 * Math.random() returns [0, 1), so floor(r * n) is already in range — but a
 * caller-supplied random that returns exactly 1 would land off the end, and
 * silently rendering nothing is worse than wrapping.
 */
export function pickLoaderIndex(random: () => number = Math.random): number {
  return Math.floor(random() * LOADERS.length) % LOADERS.length;
}

export function GeneratingLoader({
  label,
  forceIndex,
}: {
  label?: string;
  /** Pin a specific loader. Previews only — production always rolls. */
  forceIndex?: number;
}) {
  // Picked once per mount; callers unmount between generations so each new
  // generation re-rolls.
  const [rolled] = useState(pickLoaderIndex);
  const reduceMotion = useReduceMotion();
  const index = forceIndex ?? rolled;
  const Loader = LOADERS[index] ?? LOADERS[0];

  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      <Loader animate={!reduceMotion} />
      {label ? (
        <Text accessibilityLiveRegion="polite" style={styles.label}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12, paddingVertical: 8 },
  stage: { width: STAGE_W, height: STAGE_H },
  label: { color: colors.dim, fontSize: 13 },
});
