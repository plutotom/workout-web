import Svg, { G, Path } from "react-native-svg";

/** Lucide-sized cowboy hat, tilted — used as the yee haw control. */
export function CowboyHatIcon({
  size = 24,
  color = "currentColor",
  fill = "none",
  strokeWidth = 2,
  rotation = -22,
}: {
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  /** Degrees. Negative tilts counter-clockwise (left side up). */
  rotation?: number;
}) {
  const filled = fill !== "none";
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <G transform={`rotate(${rotation}, 12, 12)`}>
        {/* Crown: pinched top with center dent */}
        <Path
          d="M6.5 14.5C6.5 10 7.5 6 9 5c1.2-.8 2 .8 3 .8s1.8-1.6 3-.8c1.5 1 2.5 5 2.5 9.5"
          fill={filled ? fill : "none"}
        />
        {/* Brim: wide, curled up at both ends */}
        <Path
          d="M2 10c.4 4.6 4.6 7.5 10 7.5s9.6-2.9 10-7.5c-1.6 2-3.4 3.2-5.5 3.9-1.4.4-2.9.6-4.5.6s-3.1-.2-4.5-.6C5.4 13.2 3.6 12 2 10Z"
          fill={filled ? fill : "none"}
        />
        {/* Hat band */}
        {!filled ? (
          <Path d="M6.8 12.2c1.7.5 3.4.8 5.2.8s3.5-.3 5.2-.8" />
        ) : null}
      </G>
    </Svg>
  );
}
