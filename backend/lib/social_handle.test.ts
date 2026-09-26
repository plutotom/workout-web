import { describe, expect, it } from "vitest";

import {
  handleBaseFromEmail,
  isReservedHandle,
  isValidHandle,
  matchesAthleteSearch,
  normalizeHandleInput,
  stringPrefixRange,
} from "./social_handle";

describe("social_handle", () => {
  it("normalizes @ prefixes and casing", () => {
    expect(normalizeHandleInput("  @Lift_Pro ")).toBe("lift_pro");
  });

  it("builds a valid handle from email", () => {
    expect(handleBaseFromEmail("Jane.Doe+tag@example.com")).toBe(
      "jane_doe_tag",
    );
    expect(isValidHandle(handleBaseFromEmail("a@b.co"))).toBe(true);
    expect(handleBaseFromEmail("..@example.com")).toBe("athlete");
  });

  it("matches username or display name, never email", () => {
    const user = {
      handle: "lift_pro",
      displayName: "Jane Athlete",
      email: "jane.doe@example.com",
    };
    expect(matchesAthleteSearch(user, "lift")).toBe(true);
    expect(matchesAthleteSearch(user, "@lift_pro")).toBe(true);
    expect(matchesAthleteSearch(user, "jane")).toBe(true);
    expect(matchesAthleteSearch(user, "athlete")).toBe(true);
    expect(matchesAthleteSearch(user, "jane.doe@")).toBe(false);
    expect(matchesAthleteSearch(user, "example.com")).toBe(false);
    expect(matchesAthleteSearch(user, "zzz")).toBe(false);
  });

  it("rejects reserved usernames", () => {
    expect(isReservedHandle("admin")).toBe(true);
    expect(isReservedHandle("support")).toBe(true);
    expect(isReservedHandle("lift_pro")).toBe(false);
  });

  it("builds a prefix range that includes later handles, not only a.. early ones", () => {
    const { start, end } = stringPrefixRange("zack");
    expect(start).toBe("zack");
    expect("zack_lift" < end).toBe(true);
    expect("aaron" < start).toBe(true);
  });
});
