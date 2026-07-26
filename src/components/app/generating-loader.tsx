"use client";

import { useState } from "react";

/**
 * Loading animations for AI generation. One is picked at random each time a
 * generation starts, so the wait doesn't feel like the same screen every time.
 *
 * Styles live in app/loaders.css. All motion is transform/opacity only so it
 * stays on the compositor thread; reduced-motion is handled globally.
 *
 * Every loop is continuously in motion — none of them hold still long enough
 * to read as a hung request, which is the main way a loader loses trust.
 */

function LoadingTheBar() {
  return (
    <svg
      viewBox="0 0 300 132"
      className="wl-lb"
      role="img"
      aria-label="A barbell being loaded with plates, lifted, then stripped"
    >
      <defs>
        <linearGradient id="wlBarShaft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--g2)" />
          <stop offset="1" stopColor="var(--g4)" />
        </linearGradient>
        <radialGradient id="wlBarShadow">
          <stop offset="0" stopColor="rgba(255,255,255,0.16)" />
          <stop offset="0.45" stopColor="rgba(255,255,255,0.09)" />
          <stop offset="0.72" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <ellipse
        className="lb-shadow"
        cx="150"
        cy="121"
        rx="58"
        ry="5.5"
        fill="url(#wlBarShadow)"
      />

      <g className="lb-rig">
        <rect
          x="100"
          y="62"
          width="100"
          height="6"
          rx="3"
          fill="url(#wlBarShaft)"
        />
        {/* knurling: a dashed thick stroke is cheaper than 16 rects */}
        <line
          x1="118"
          y1="65"
          x2="182"
          y2="65"
          stroke="rgba(12,12,14,0.5)"
          strokeWidth="6"
          strokeDasharray="1 3"
        />

        <g className="lb-arm lb-arm-l">
          <rect x="44" y="62" width="58" height="6" rx="3" fill="var(--g3)" />
          <rect x="92" y="55" width="5" height="20" rx="2" fill="var(--g3)" />
          <g className="lb-slot lb-s1">
            <rect
              className="lb-plate"
              x="80"
              y="27.5"
              width="12"
              height="75"
              rx="3"
              fill="var(--surface-2)"
              stroke="rgba(255,255,255,0.22)"
            />
          </g>
          <g className="lb-slot lb-s2">
            <rect
              className="lb-plate"
              x="65"
              y="35.5"
              width="12"
              height="59"
              rx="3"
              fill="var(--surface-2)"
              stroke="rgba(255,255,255,0.22)"
            />
          </g>
          <g className="lb-slot lb-s3">
            <rect
              className="lb-plate"
              x="52"
              y="42.5"
              width="12"
              height="45"
              rx="3"
              fill="var(--surface-2)"
              stroke="rgba(255,255,255,0.22)"
            />
          </g>
          <g className="lb-slot lb-s4">
            <rect
              className="lb-plate"
              x="41"
              y="47.5"
              width="11"
              height="35"
              rx="3"
              fill="var(--surface-2)"
              stroke="rgba(255,255,255,0.22)"
            />
          </g>
        </g>

        <g className="lb-arm lb-arm-r">
          <rect x="198" y="62" width="58" height="6" rx="3" fill="var(--g3)" />
          <rect x="203" y="55" width="5" height="20" rx="2" fill="var(--g3)" />
          <g className="lb-slot lb-s1">
            <rect
              className="lb-plate"
              x="208"
              y="27.5"
              width="12"
              height="75"
              rx="3"
              fill="var(--surface-2)"
              stroke="rgba(255,255,255,0.22)"
            />
          </g>
          <g className="lb-slot lb-s2">
            <rect
              className="lb-plate"
              x="223"
              y="35.5"
              width="12"
              height="59"
              rx="3"
              fill="var(--surface-2)"
              stroke="rgba(255,255,255,0.22)"
            />
          </g>
          <g className="lb-slot lb-s3">
            <rect
              className="lb-plate"
              x="236"
              y="42.5"
              width="12"
              height="45"
              rx="3"
              fill="var(--surface-2)"
              stroke="rgba(255,255,255,0.22)"
            />
          </g>
          <g className="lb-slot lb-s4">
            <rect
              className="lb-plate"
              x="248"
              y="47.5"
              width="11"
              height="35"
              rx="3"
              fill="var(--surface-2)"
              stroke="rgba(255,255,255,0.22)"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}

function TheLifter() {
  return (
    <svg
      viewBox="0 0 300 165"
      className="wl-lf"
      role="img"
      aria-label="A figure repeatedly deadlifting a barbell"
    >
      <line
        x1="46"
        y1="149"
        x2="254"
        y2="149"
        stroke="var(--line)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse
        className="lf-barshadow"
        cx="150"
        cy="152"
        rx="76"
        ry="3.5"
        fill="rgba(255,255,255,0.1)"
      />
      <rect
        x="139"
        y="142.5"
        width="23"
        height="6.5"
        rx="3.2"
        fill="var(--g4)"
      />

      <g className="lf-thigh">
        <rect x="144" y="96" width="12" height="29" rx="6" fill="var(--g3)" />
        <g className="lf-shin">
          <rect
            x="144.5"
            y="122"
            width="11"
            height="27"
            rx="5.5"
            fill="var(--g4)"
          />
        </g>
      </g>

      <g className="lf-bar">
        <rect x="88" y="127" width="124" height="6" rx="3" fill="var(--g2)" />
        <rect
          x="82"
          y="115"
          width="10"
          height="30"
          rx="3"
          fill="var(--surface-2)"
          stroke="rgba(255,255,255,0.24)"
        />
        <rect
          x="208"
          y="115"
          width="10"
          height="30"
          rx="3"
          fill="var(--surface-2)"
          stroke="rgba(255,255,255,0.24)"
        />
        <rect
          x="70"
          y="111"
          width="11"
          height="38"
          rx="3"
          fill="var(--surface-2)"
          stroke="rgba(255,255,255,0.24)"
        />
        <rect
          x="219"
          y="111"
          width="11"
          height="38"
          rx="3"
          fill="var(--surface-2)"
          stroke="rgba(255,255,255,0.24)"
        />
      </g>

      <g className="lf-body">
        <rect x="141" y="52" width="18" height="46" rx="8" fill="var(--text)" />
        <g className="lf-head">
          <circle cx="150" cy="34" r="14" fill="var(--text)" />
          <g className="lf-eye">
            <circle cx="156" cy="32" r="2.2" fill="var(--bg)" />
            <circle cx="147" cy="32" r="2.2" fill="var(--bg)" />
          </g>
          <g className="lf-puff" opacity="0">
            <circle cx="172" cy="26" r="3" fill="var(--g4)" />
          </g>
          <g className="lf-puff lf-puff-b" opacity="0">
            <circle cx="180" cy="32" r="2" fill="var(--g4)" />
          </g>
        </g>
        <g className="lf-arms">
          <rect
            x="141"
            y="50"
            width="7"
            height="56"
            rx="3.5"
            fill="var(--g3)"
          />
          <rect
            x="153"
            y="50"
            width="7"
            height="56"
            rx="3.5"
            fill="var(--g2)"
          />
          <circle cx="144.5" cy="105" r="4.5" fill="var(--text)" />
          <circle cx="156.5" cy="105" r="4.5" fill="var(--text)" />
        </g>
      </g>
    </svg>
  );
}

function Squish() {
  return (
    <svg
      viewBox="0 0 300 165"
      className="wl-sq"
      role="img"
      aria-label="A rounded character repeatedly squatting a barbell"
    >
      <line
        x1="46"
        y1="149"
        x2="254"
        y2="149"
        stroke="var(--line)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse
        className="sq-shadow"
        cx="150"
        cy="153"
        rx="42"
        ry="4"
        fill="rgba(255,255,255,0.11)"
      />

      <g className="sq-follow">
        <rect x="88" y="80" width="124" height="6" rx="3" fill="var(--g2)" />
        <rect
          x="76"
          y="68"
          width="11"
          height="30"
          rx="3"
          fill="var(--surface-2)"
          stroke="rgba(255,255,255,0.24)"
        />
        <rect
          x="213"
          y="68"
          width="11"
          height="30"
          rx="3"
          fill="var(--surface-2)"
          stroke="rgba(255,255,255,0.24)"
        />
        <rect
          x="64"
          y="72"
          width="10"
          height="22"
          rx="3"
          fill="var(--surface-2)"
          stroke="rgba(255,255,255,0.24)"
        />
        <rect
          x="226"
          y="72"
          width="10"
          height="22"
          rx="3"
          fill="var(--surface-2)"
          stroke="rgba(255,255,255,0.24)"
        />
      </g>

      <rect
        className="sq-body"
        x="118"
        y="87"
        width="64"
        height="62"
        rx="24"
        fill="var(--text)"
      />

      <g className="sq-follow">
        <g className="sq-eye">
          <circle cx="138" cy="104" r="4" fill="var(--bg)" />
          <circle cx="162" cy="104" r="4" fill="var(--bg)" />
        </g>
        <g className="sq-spark">
          <circle cx="110" cy="90" r="2.6" fill="var(--g3)" />
        </g>
        <g className="sq-spark sq-spark-b">
          <circle cx="190" cy="94" r="2" fill="var(--g3)" />
        </g>
      </g>
    </svg>
  );
}

function BellSwing() {
  return (
    <svg
      viewBox="0 0 120 126"
      className="wl-bs"
      role="img"
      aria-label="A kettlebell swinging back and forth"
    >
      <line
        x1="14"
        y1="112"
        x2="106"
        y2="112"
        stroke="var(--line)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse
        className="bs-shadow"
        cx="60"
        cy="115"
        rx="25"
        ry="3"
        fill="rgba(255,255,255,0.1)"
      />
      <g className="bs-swing">
        <path
          d="M45 62 Q45 36 60 36 Q75 36 75 62"
          fill="none"
          stroke="var(--g3)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <rect x="49" y="52" width="22" height="16" rx="5" fill="var(--text)" />
        <circle cx="60" cy="84" r="28" fill="var(--text)" />
        <circle cx="50" cy="80" r="4.5" fill="var(--bg)" />
        <circle cx="70" cy="80" r="4.5" fill="var(--bg)" />
        <path
          d="M53 92 Q60 97 67 92"
          fill="none"
          stroke="var(--bg)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.6"
        />
      </g>
      <rect x="51" y="29" width="18" height="13" rx="6" fill="var(--g4)" />
    </svg>
  );
}

function ChunkPress() {
  return (
    <svg
      viewBox="0 0 120 126"
      className="wl-cp"
      role="img"
      aria-label="A stocky character pressing a barbell overhead"
    >
      <line
        x1="14"
        y1="112"
        x2="106"
        y2="112"
        stroke="var(--line)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse cx="60" cy="115" rx="36" ry="3" fill="rgba(255,255,255,0.1)" />
      <g className="cp-upper">
        <rect
          className="cp-arm cp-arm-l"
          x="13"
          y="44"
          width="11"
          height="34"
          rx="5.5"
          fill="var(--g3)"
        />
        <rect
          className="cp-arm cp-arm-r"
          x="96"
          y="44"
          width="11"
          height="34"
          rx="5.5"
          fill="var(--g3)"
        />
        <g className="cp-bar">
          <rect x="16" y="41" width="88" height="5" rx="2.5" fill="var(--g2)" />
          <rect
            x="10"
            y="35"
            width="7"
            height="17"
            rx="2"
            fill="var(--surface-2)"
            stroke="rgba(255,255,255,0.24)"
          />
          <rect
            x="103"
            y="35"
            width="7"
            height="17"
            rx="2"
            fill="var(--surface-2)"
            stroke="rgba(255,255,255,0.24)"
          />
        </g>
      </g>
      <rect
        className="cp-body"
        x="22"
        y="58"
        width="76"
        height="54"
        rx="20"
        fill="var(--text)"
      />
      <g className="cp-face">
        <circle cx="45" cy="80" r="4.5" fill="var(--bg)" />
        <circle cx="75" cy="80" r="4.5" fill="var(--bg)" />
        <rect
          x="52"
          y="93"
          width="16"
          height="3.5"
          rx="1.75"
          fill="var(--bg)"
          opacity="0.55"
        />
      </g>
    </svg>
  );
}

const LOADERS = [LoadingTheBar, TheLifter, Squish, BellSwing, ChunkPress];

/** Display names, index-aligned with the pool. Used by the /dev/ui preview. */
export const LOADER_NAMES = [
  "Loading the Bar",
  "The Lifter",
  "Squish",
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
  /** Pin a specific loader. Dev preview only — production always rolls. */
  forceIndex?: number;
}) {
  // Picked once per mount. The caller unmounts this between generations, so
  // each new generation re-rolls. Chosen lazily rather than at module scope so
  // it never renders on the server and mismatches on hydration.
  const [rolled] = useState(pickLoaderIndex);
  const index = forceIndex ?? rolled;
  const Loader = LOADERS[index] ?? LOADERS[0];

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="wl-stage w-full" aria-hidden={label ? true : undefined}>
        <Loader />
      </div>
      {label ? (
        <p className="text-muted-foreground text-sm" role="status">
          {label}
        </p>
      ) : null}
    </div>
  );
}
