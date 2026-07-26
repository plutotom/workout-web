import { describe, expect, it } from "vitest";

import {
  LOADER_COUNT,
  LOADER_NAMES,
  pickLoaderIndex,
} from "./generating-loader";

describe("pickLoaderIndex", () => {
  it("stays in range across the whole unit interval", () => {
    for (let i = 0; i <= 1000; i++) {
      const index = pickLoaderIndex(() => i / 1000);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(LOADER_COUNT);
      expect(Number.isInteger(index)).toBe(true);
    }
  });

  it("wraps rather than overflowing when random() returns exactly 1", () => {
    // Math.random() never returns 1, but a caller-supplied source might, and
    // an out-of-range index renders nothing at all.
    expect(pickLoaderIndex(() => 1)).toBe(0);
  });

  it("can reach every loader", () => {
    const seen = new Set(
      Array.from({ length: 1000 }, (_, i) => pickLoaderIndex(() => i / 1000)),
    );
    expect(seen.size).toBe(LOADER_COUNT);
  });

  it("keeps names aligned with the pool", () => {
    expect(LOADER_NAMES).toHaveLength(LOADER_COUNT);
  });
});
