"use client";

import { useLayoutEffect, useState, type CSSProperties } from "react";

type FrameMode = "fill" | "dock";

type ViewportFrame = {
  height: number;
  offsetTop: number;
  keyboardOpen: boolean;
};

type UseVisualViewportFrameOptions = {
  /**
   * `fill` — fullscreen overlays (top + height = visual viewport).
   * `dock` — bottom sheets/dialogs (bottom inset + maxHeight).
   */
  mode?: FrameMode;
};

/**
 * Pins a `position: fixed` overlay to the *visual* viewport.
 *
 * On iOS Safari/PWA the soft keyboard shrinks `visualViewport` but often
 * leaves `100dvh` / layout viewport alone — so fixed sheets get covered.
 * Binding to the visual viewport keeps chrome above the keyboard.
 */
export function useVisualViewportFrame(
  active: boolean,
  options: UseVisualViewportFrameOptions = {},
): {
  style: CSSProperties | undefined;
  keyboardOpen: boolean;
} {
  const mode = options.mode ?? "fill";
  const [frame, setFrame] = useState<ViewportFrame | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    let baseline = Math.max(window.innerHeight, vv.height);

    const update = () => {
      const height = vv.height;
      const offsetTop = vv.offsetTop;

      // Keyboard closed-ish: keep a fresh baseline for open detection.
      if (height >= window.innerHeight * 0.92) {
        baseline = Math.max(window.innerHeight, height);
      }

      setFrame({
        height,
        offsetTop,
        keyboardOpen: baseline - height > 80,
      });
    };

    const frame = requestAnimationFrame(update);
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);

  if (!active || !frame) {
    return { style: undefined, keyboardOpen: false };
  }

  if (mode === "dock") {
    const bottom = Math.max(
      0,
      window.innerHeight - (frame.offsetTop + frame.height),
    );
    return {
      keyboardOpen: frame.keyboardOpen,
      style: {
        maxHeight: frame.height,
        bottom,
        top: "auto",
        transition: "none",
      },
    };
  }

  return {
    keyboardOpen: frame.keyboardOpen,
    style: {
      height: frame.height,
      maxHeight: frame.height,
      top: frame.offsetTop,
      bottom: "auto",
      // Avoid fighting Radix enter/exit transforms + height thrash.
      transition: "none",
    },
  };
}
