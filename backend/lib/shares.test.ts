import { describe, expect, it } from "vitest";

import { generateShareToken, isShareTokenFormat } from "./shares";

describe("generateShareToken", () => {
  it("produces a token the format check accepts", () => {
    expect(isShareTokenFormat(generateShareToken())).toBe(true);
  });

  it("is URL-safe — no padding or characters needing escaping", () => {
    for (let i = 0; i < 50; i++) {
      const token = generateShareToken();
      expect(token).toBe(encodeURIComponent(token));
      expect(token).not.toContain("=");
    }
  });

  it("does not repeat", () => {
    const tokens = new Set(
      Array.from({ length: 500 }, () => generateShareToken()),
    );
    expect(tokens.size).toBe(500);
  });
});

describe("isShareTokenFormat", () => {
  it("rejects anything that isn't a 22-character URL-safe token", () => {
    expect(isShareTokenFormat("")).toBe(false);
    expect(isShareTokenFormat("short")).toBe(false);
    expect(isShareTokenFormat("a".repeat(21))).toBe(false);
    expect(isShareTokenFormat("a".repeat(23))).toBe(false);
    expect(isShareTokenFormat(`${"a".repeat(21)}/`)).toBe(false);
    expect(isShareTokenFormat(`${"a".repeat(21)}+`)).toBe(false);
  });

  it("accepts the alphabet it generates", () => {
    expect(isShareTokenFormat(`${"a".repeat(20)}-_`)).toBe(true);
  });
});
