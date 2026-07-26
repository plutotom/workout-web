import { describe, expect, it } from "vitest";
import net from "node:net";

import {
  assertSlug,
  formatWorktreeSummary,
  isPortAvailable,
  isManagedSupervisorCommand,
  isOwnedConvexCommand,
  parseEnv,
  renderManagedEnv,
  slugFromBranch,
} from "./worktree-lib.mjs";

describe("worktree runtime helpers", () => {
  it("accepts strict slugs and rejects ambiguous input", () => {
    expect(assertSlug("auth-spike-2")).toBe("auth-spike-2");
    expect(() => assertSlug("Auth Spike")).toThrow(/Invalid worktree slug/);
    expect(() => assertSlug("auth--spike")).toThrow(/Invalid worktree slug/);
  });

  it("extracts slugs only from managed branches", () => {
    expect(slugFromBranch("wt/auth-spike")).toBe("auth-spike");
    expect(() => slugFromBranch("feature/auth-spike")).toThrow(/wt\/<slug>/);
  });

  it("parses quoted dotenv values", () => {
    expect(parseEnv('A="hello world"\nB=plain\n')).toEqual({
      A: "hello world",
      B: "plain",
    });
  });

  it("replaces only the managed environment block", () => {
    const first = renderManagedEnv("UNMANAGED=keep\n", { A: "one" });
    const second = renderManagedEnv(first, { A: "two" });
    expect(second).toContain("UNMANAGED=keep");
    expect(second).toContain('A="two"');
    expect(second).not.toContain('A="one"');
  });

  it("distinguishes listening ports from available ports", async () => {
    const server = net.createServer();
    await new Promise((resolve) =>
      server.listen({ host: "127.0.0.1", port: 0 }, resolve),
    );
    const address = server.address();
    expect(typeof address).toBe("object");
    expect(await isPortAvailable(address.port)).toBe(false);
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    expect(await isPortAvailable(address.port)).toBe(true);
  });

  it("renders a compact worktree summary without a wide table", () => {
    const summary = formatWorktreeSummary(
      {
        slug: "ios-spike",
        branch: "wt/ios-spike",
        status: "running",
        browserOrigin: "http://localhost:4272",
        worktreePath: "/repo/.worktrees/ios-spike",
      },
      ["convexCloud", "convexSite"],
      "/repo",
    );
    expect(summary).toBe(
      [
        "ios-spike · running",
        "  branch:    wt/ios-spike",
        "  app:       http://localhost:4272",
        "  listening: convexCloud, convexSite",
        "  path:      .worktrees/ios-spike",
      ].join("\n"),
    );
  });

  it("matches only the expected worktree supervisor", () => {
    expect(
      isManagedSupervisorCommand(
        "node scripts/worktree.mjs start ios-spike",
        "ios-spike",
      ),
    ).toBe(true);
    expect(
      isManagedSupervisorCommand(
        "node scripts/worktree.mjs start other-ios-spike",
        "ios-spike",
      ),
    ).toBe(false);
  });

  it("does not claim an unrelated Convex listener", () => {
    const manifest = {
      worktreePath: "/repo/.worktrees/ios-spike",
      ports: { convexCloud: 3212, convexSite: 3213 },
    };
    expect(
      isOwnedConvexCommand(
        "/repo/.worktrees/ios-spike/.convex/local/backend --port 3212 --site-proxy-port 3213",
        manifest,
      ),
    ).toBe(true);
    expect(
      isOwnedConvexCommand(
        "/other/.convex/local/backend --port 3212 --site-proxy-port 3213",
        manifest,
      ),
    ).toBe(false);
    expect(
      isOwnedConvexCommand(
        "/repo/.worktrees/ios-spike/.convex/local/backend --port 9999 --site-proxy-port 3213",
        manifest,
      ),
    ).toBe(false);
  });
});
