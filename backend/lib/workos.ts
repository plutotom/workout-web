const WORKOS_USERS_URL = "https://api.workos.com/user_management/users";
const MAX_EMAIL_LENGTH = 320;

type WorkosUserPayload = {
  id?: unknown;
  email?: unknown;
  email_verified?: unknown;
};

/** Validate the security-relevant fields from a WorkOS user response. */
export function parseVerifiedWorkosEmail(
  payload: unknown,
  expectedUserId: string,
): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("WorkOS returned an invalid user");
  }

  const user = payload as WorkosUserPayload;
  if (user.id !== expectedUserId) {
    throw new Error("WorkOS returned an unexpected user");
  }
  if (user.email_verified !== true) {
    throw new Error("A verified email is required");
  }
  if (typeof user.email !== "string") {
    throw new Error("WorkOS returned an invalid email");
  }

  const email = user.email.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !email.includes("@")) {
    throw new Error("WorkOS returned an invalid email");
  }
  return email;
}

/** Resolve a signed-in user through WorkOS using a server-only API key. */
export async function fetchVerifiedWorkosEmail(
  workosUserId: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(
    `${WORKOS_USERS_URL}/${encodeURIComponent(workosUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error("Unable to verify the signed-in user");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("WorkOS returned an invalid response");
  }

  return parseVerifiedWorkosEmail(payload, workosUserId);
}
