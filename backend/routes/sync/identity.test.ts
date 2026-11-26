import { describe, expect, it } from "vitest";

import { decideOwner } from "./identity";

const tokenIdentifier = "https://clerk.example.com|user_123";

describe("decideOwner", () => {
  it("keeps a persisted owner even when the email now matches someone else", () => {
    expect(
      decideOwner({
        tokenIdentifier,
        persistedOwnerId: "owner-a",
        emailVerified: true,
        legacyUserIdForEmail: "legacy-b",
      }),
    ).toEqual({ kind: "existing", ownerId: "owner-a" });
  });

  it("adopts a legacy user through a verified email", () => {
    expect(
      decideOwner({
        tokenIdentifier,
        persistedOwnerId: null,
        emailVerified: true,
        legacyUserIdForEmail: "legacy-b",
      }),
    ).toEqual({
      kind: "create",
      ownerId: "legacy-b",
      legacyUserId: "legacy-b",
    });
  });

  it("never adopts a legacy user through an unverified email", () => {
    expect(
      decideOwner({
        tokenIdentifier,
        persistedOwnerId: null,
        emailVerified: false,
        legacyUserIdForEmail: "legacy-b",
      }),
    ).toEqual({ kind: "create", ownerId: tokenIdentifier });
  });

  it("gives a new identity its own stable owner", () => {
    expect(
      decideOwner({
        tokenIdentifier,
        persistedOwnerId: null,
        emailVerified: true,
        legacyUserIdForEmail: null,
      }),
    ).toEqual({ kind: "create", ownerId: tokenIdentifier });
  });
});
