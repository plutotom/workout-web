import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ proxy: vi.fn() }));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  authkitProxy: () => mocks.proxy,
}));
import proxy from "./proxy";
beforeEach(() => mocks.proxy.mockReset().mockResolvedValue(undefined));
it.each(["/api/mobile-auth/token", "/api/mobile-auth/exchange"])(
  "does not refresh browser credentials on native endpoint %s",
  async (path) => {
    const request = new NextRequest(`https://workout.example.com${path}`, {
      headers: { Cookie: "wos-session=browser-session" },
    });
    const result = await proxy(request, {} as Parameters<typeof proxy>[1]);
    expect(mocks.proxy).not.toHaveBeenCalled();
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  },
);
it("continues to protect web app routes with AuthKit", async () => {
  const request = new NextRequest("https://workout.example.com/dashboard");
  await proxy(request, {} as Parameters<typeof proxy>[1]);
  expect(mocks.proxy).toHaveBeenCalledOnce();
});
