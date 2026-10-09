import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  data: {
    state: "mobile:exchange-code",
    accessToken: "access",
    refreshToken: "refresh",
    user: { id: "user_1", email: "user@example.com" },
  },
  set: vi.fn(),
  delete: vi.fn(),
  store: vi.fn(),
  seal: vi.fn(),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  handleAuth:
    (options: { onSuccess: (data: unknown) => Promise<void> }) => async () =>
      options.onSuccess(mocks.data),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set, delete: mocks.delete }),
}));
vi.mock("@/lib/mobile-auth", () => ({
  mobileAuthEnabled: () => true,
  storeMobileAuthSession: mocks.store,
}));
vi.mock("@/lib/mobile-auth-session", () => ({ sealMobileSession: mocks.seal }));
import { GET } from "./route";
beforeEach(() => {
  mocks.set.mockReset();
  mocks.delete.mockReset();
  mocks.store.mockReset();
  mocks.seal.mockReset().mockResolvedValue("native-session");
  mocks.data.state = "mobile:exchange-code";
});
afterEach(() => vi.unstubAllEnvs());
it("hands the session to mobile without leaving a competing browser refresh cookie", async () => {
  const challenge = "a".repeat(64);
  mocks.data.state += `:${challenge}`;
  vi.stubEnv("WORKOS_COOKIE_NAME", "custom-session");
  vi.stubEnv("WORKOS_COOKIE_DOMAIN", ".example.com");
  await GET(new NextRequest("https://example.com/callback"));
  expect(mocks.store).toHaveBeenCalledWith(
    "exchange-code",
    { session: "native-session", accessToken: "access", user: mocks.data.user },
    challenge,
  );
  expect(mocks.set).toHaveBeenCalledWith("custom-session", "", {
    path: "/",
    domain: ".example.com",
    expires: new Date(0),
  });
  expect(mocks.delete).toHaveBeenCalledWith("workos-access-token");
});
it("preserves the normal web login cookie", async () => {
  mocks.data.state = "web-login";
  await GET(new NextRequest("https://example.com/callback"));
  expect(mocks.store).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
});
