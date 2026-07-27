import { describe, expect, it } from "vitest";

import {
  convexDeployArgs,
  isStagingPreview,
  resolveWorkosRedirectUri,
} from "./deployment-environment.mjs";

const config = {
  authKit: {
    dev: {
      localEnvVars: {
        NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:4271/callback",
      },
    },
    prod: {
      configure: {
        redirectUris: ["https://workout.plutotom.com/callback"],
      },
    },
  },
};

describe("deployment environment", () => {
  it("recognizes only the staging Vercel Preview branch", () => {
    expect(
      isStagingPreview({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "staging",
      }),
    ).toBe(true);
    expect(
      isStagingPreview({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feature/auth",
      }),
    ).toBe(false);
    expect(
      isStagingPreview({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "staging",
      }),
    ).toBe(false);
  });

  it("uses the stable branch URL for preview callbacks", () => {
    expect(
      resolveWorkosRedirectUri(config, {
        VERCEL_ENV: "preview",
        VERCEL_BRANCH_URL: "workout-web-git-staging.example.vercel.app",
        VERCEL_URL: "workout-unique-hash.example.vercel.app",
      }),
    ).toBe("https://workout-web-git-staging.example.vercel.app/callback");
  });

  it("builds staging against the URL from its deployment-scoped key", () => {
    expect(convexDeployArgs({ skipWorkosCheck: true })).toEqual([
      "exec",
      "convex",
      "deploy",
      "--cmd",
      "pnpm run build:web",
      "--cmd-url-env-var-name",
      "NEXT_PUBLIC_CONVEX_URL",
      "--skip-workos-check",
    ]);
    expect(convexDeployArgs()).not.toContain("--preview-name");
    expect(convexDeployArgs()).toContain("NEXT_PUBLIC_CONVEX_URL");
  });

  it("falls back to the deployment URL when no branch URL is available", () => {
    expect(
      resolveWorkosRedirectUri(config, {
        VERCEL_ENV: "preview",
        VERCEL_URL: "https://workout-unique-hash.example.vercel.app/",
      }),
    ).toBe("https://workout-unique-hash.example.vercel.app/callback");
  });

  it("keeps production and local callbacks isolated", () => {
    expect(resolveWorkosRedirectUri(config, { VERCEL_ENV: "production" })).toBe(
      "https://workout.plutotom.com/callback",
    );
    expect(
      resolveWorkosRedirectUri(config, { VERCEL_ENV: "development" }),
    ).toBe("http://localhost:4271/callback");
  });

  it("rejects preview URLs with paths", () => {
    expect(() =>
      resolveWorkosRedirectUri(config, {
        VERCEL_ENV: "preview",
        VERCEL_BRANCH_URL: "example.vercel.app/not-an-origin",
      }),
    ).toThrow(/without a path/);
  });
});
