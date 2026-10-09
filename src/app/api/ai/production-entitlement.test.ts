import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  query: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@backend/api", () => ({
  api: { routes: { auth: { users: { entitlement: "entitlement" } } } },
}));
vi.mock("@/lib/ai/request-auth", () => ({
  accessTokenForRequest: mocks.token,
}));
vi.mock("@/lib/ai/generate-structured", () => ({
  generateStructuredObject: mocks.generate,
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    query = mocks.query;
  },
}));

import { POST as session } from "./session/generate/route";
import { POST as template } from "./templates/generate/route";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
  mocks.token.mockReset().mockResolvedValue("verified-test-token");
  mocks.query.mockReset().mockResolvedValue({ isPro: false, plan: "free" });
  mocks.generate.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

for (const [name, handler, body] of [
  ["session", session, { prompt: "Squats", current: { exercises: [] } }],
  ["templates", template, { prompt: "Squats", mode: "create" }],
] as const) {
  describe(`${name} production authorization`, () => {
    const request = () =>
      new Request(`https://workout.example/api/ai/${name}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dev-pro-override": "pro",
          cookie: "workout-dev-pro-override=pro",
        },
        body: JSON.stringify(body),
      });
    it("denies a free user despite forged override headers and cookies", async () => {
      const response = await handler(request());
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "PRO_REQUIRED" });
      expect(mocks.query).toHaveBeenCalledOnce();
      expect(mocks.generate).not.toHaveBeenCalled();
    });
    it("still requires authentication before considering any override", async () => {
      mocks.token.mockResolvedValue(null);
      expect((await handler(request())).status).toBe(401);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
    });
  });
}
