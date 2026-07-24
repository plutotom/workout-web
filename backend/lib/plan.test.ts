import { describe, expect, it } from "vitest";

import { allowManualPro, isProUser, parseProEmails } from "./plan";

describe("parseProEmails", () => {
  it("parses and lowercases a comma list", () => {
    expect([...parseProEmails("Ada@Example.com, bob@x.com ")]).toEqual([
      "ada@example.com",
      "bob@x.com",
    ]);
  });

  it("returns empty for blank", () => {
    expect(parseProEmails(undefined).size).toBe(0);
    expect(parseProEmails("  ").size).toBe(0);
  });
});

describe("isProUser", () => {
  it("treats plan=pro as Pro", () => {
    expect(
      isProUser(
        { email: "a@b.com", emailVerifiedAt: undefined, plan: "pro" },
        undefined,
      ),
    ).toBe(true);
  });

  it("matches PRO_EMAILS allowlist", () => {
    expect(
      isProUser(
        {
          email: "Ada@Example.com",
          emailVerifiedAt: 1,
          plan: "free",
        },
        "ada@example.com",
      ),
    ).toBe(true);
  });

  it("rejects an unverified email allowlist match", () => {
    expect(
      isProUser(
        {
          email: "Ada@Example.com",
          emailVerifiedAt: undefined,
          plan: "free",
        },
        "ada@example.com",
      ),
    ).toBe(false);
  });

  it("defaults missing plan to free", () => {
    expect(isProUser({ email: "a@b.com", emailVerifiedAt: 1 }, "")).toBe(false);
  });
});

describe("allowManualPro", () => {
  it("is true only for the string true", () => {
    expect(allowManualPro("true")).toBe(true);
    expect(allowManualPro("TRUE")).toBe(true);
    expect(allowManualPro("1")).toBe(false);
    expect(allowManualPro(undefined)).toBe(false);
  });
});
