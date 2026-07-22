import { describe, expect, it } from "vitest";
import net from "node:net";

import {
  assertSlug,
  isPortAvailable,
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
});
