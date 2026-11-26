export type OwnerDecision =
  | { kind: "existing"; ownerId: string }
  | { kind: "create"; ownerId: string; legacyUserId?: string };

/**
 * Picks the sync owner for a signed-in identity.
 *
 * The first decision is persisted and never revisited, so a later email change
 * on the identity provider cannot move data between owners. A legacy user row
 * is only adopted through a provider-verified email.
 */
export function decideOwner(input: {
  tokenIdentifier: string;
  persistedOwnerId: string | null;
  emailVerified: boolean;
  legacyUserIdForEmail: string | null;
}): OwnerDecision {
  if (input.persistedOwnerId !== null) {
    return { kind: "existing", ownerId: input.persistedOwnerId };
  }
  if (input.emailVerified && input.legacyUserIdForEmail !== null) {
    return {
      kind: "create",
      ownerId: input.legacyUserIdForEmail,
      legacyUserId: input.legacyUserIdForEmail,
    };
  }
  return { kind: "create", ownerId: input.tokenIdentifier };
}
