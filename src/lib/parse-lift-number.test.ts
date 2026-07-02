import { describe, expect, it } from "vitest";

import {
  effectiveLiftWeight,
  parseLiftNumber,
  sanitizeWeightDraft,
} from "./parse-lift-number";

describe("sanitizeWeightDraft", () => {
  it("keeps digits, plus, and spaces", () => {
    expect(sanitizeWeightDraft("45+45+5")).toBe("45+45+5");
    expect(sanitizeWeightDraft("45 + 45")).toBe("45 + 45");
  });

  it("strips other characters", () => {
    expect(sanitizeWeightDraft("45lbs+45")).toBe("45+45");
    expect(sanitizeWeightDraft("12.5+10")).toBe("125+10");
  });
});

describe("parseLiftNumber", () => {
  it("parses plain integers", () => {
    expect(parseLiftNumber("135")).toBe(135);
    expect(parseLiftNumber("  225  ")).toBe(225);
  });

  it("parses addition chains", () => {
    expect(parseLiftNumber("45+45+5")).toBe(95);
    expect(parseLiftNumber("45 + 45 + 5")).toBe(95);
    expect(parseLiftNumber("25+25")).toBe(50);
  });

  it("treats empty input as zero", () => {
    expect(parseLiftNumber("")).toBe(0);
    expect(parseLiftNumber("   ")).toBe(0);
  });

  it("rejects invalid expressions", () => {
    expect(parseLiftNumber("45++5")).toBeNull();
    expect(parseLiftNumber("45+")).toBeNull();
    expect(parseLiftNumber("+45")).toBeNull();
    expect(parseLiftNumber("abc")).toBeNull();
    expect(parseLiftNumber("45-10")).toBeNull();
  });
});

describe("effectiveLiftWeight", () => {
  it("evaluates draft when valid", () => {
    expect(effectiveLiftWeight("45+45+5", 0)).toBe(95);
  });

  it("falls back to committed value when draft is invalid", () => {
    expect(effectiveLiftWeight("45+", 135)).toBe(135);
  });
});
