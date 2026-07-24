import { describe, expect, it } from "vitest";

import { isAdminUser, parseAdminEmails } from "./admin";

describe("parseAdminEmails", () => {
  it("parses and lowercases a comma list", () => {
    expect([...parseAdminEmails("Ada@Example.com, bob@x.com ")]).toEqual([
      "ada@example.com",
      "bob@x.com",
    ]);
  });

  it("returns empty for blank", () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails("  ").size).toBe(0);
  });
});

describe("isAdminUser", () => {
  it("treats role=admin as admin", () => {
    expect(isAdminUser({ email: "a@b.com", role: "admin" }, undefined)).toBe(
      true,
    );
  });

  it("matches ADMIN_EMAILS allowlist", () => {
    expect(
      isAdminUser(
        { email: "Ada@Example.com", role: "user" },
        "ada@example.com",
      ),
    ).toBe(true);
  });

  it("defaults missing role to non-admin", () => {
    expect(isAdminUser({ email: "a@b.com" }, "")).toBe(false);
  });

  it("does not treat role=user as admin without allowlist", () => {
    expect(isAdminUser({ email: "a@b.com", role: "user" }, undefined)).toBe(
      false,
    );
  });
});
