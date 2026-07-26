import { describe, expect, it } from "vitest";

import { parseVerifiedWorkosEmail } from "./workos";

describe("parseVerifiedWorkosEmail", () => {
  it("normalizes a verified WorkOS email for the expected user", () => {
    expect(
      parseVerifiedWorkosEmail(
        {
          id: "user_123",
          email: " Ada@Example.com ",
          email_verified: true,
        },
        "user_123",
      ),
    ).toBe("ada@example.com");
  });

  it("rejects a response for a different WorkOS user", () => {
    expect(() =>
      parseVerifiedWorkosEmail(
        {
          id: "user_attacker",
          email: "attacker@example.com",
          email_verified: true,
        },
        "user_123",
      ),
    ).toThrow("unexpected user");
  });

  it("rejects an unverified email", () => {
    expect(() =>
      parseVerifiedWorkosEmail(
        {
          id: "user_123",
          email: "ada@example.com",
          email_verified: false,
        },
        "user_123",
      ),
    ).toThrow("verified email");
  });

  it("rejects malformed email values", () => {
    expect(() =>
      parseVerifiedWorkosEmail(
        {
          id: "user_123",
          email: "not-an-email",
          email_verified: true,
        },
        "user_123",
      ),
    ).toThrow("invalid email");
  });
});
