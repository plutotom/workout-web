/**
 * Tiny haptic helpers for the gym UI. Uses the Vibration API where available
 * (Android/Chrome); a no-op elsewhere (iOS Safari ignores it). Guarded so it's
 * safe to call from any client handler.
 */
function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw if called without a user gesture — ignore.
  }
}

/** A light confirmation tap (e.g. completing a set). */
export function hapticTap() {
  vibrate(12);
}

/** A slightly stronger double-buzz for a meaningful success (e.g. finishing). */
export function hapticSuccess() {
  vibrate([14, 40, 24]);
}
