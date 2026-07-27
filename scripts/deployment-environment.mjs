export const STAGING_BRANCH = "staging";
export const STAGING_PREVIEW_NAME = "staging";

function configuredValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function httpsOrigin(value, label) {
  const configured = configuredValue(value);
  if (!configured) {
    throw new Error(`${label} is required`);
  }

  const url = new URL(
    configured.includes("://") ? configured : `https://${configured}`,
  );
  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be a hostname or origin without a path`);
  }
  return url.origin;
}

export function isStagingPreview(env = process.env) {
  return (
    configuredValue(env.VERCEL_ENV) === "preview" &&
    configuredValue(env.VERCEL_GIT_COMMIT_REF) === STAGING_BRANCH
  );
}

export function convexDeployArgs({
  previewName,
  skipWorkosCheck = false,
} = {}) {
  const args = [
    "exec",
    "convex",
    "deploy",
    "--cmd",
    "pnpm run build:web",
    "--cmd-url-env-var-name",
    "NEXT_PUBLIC_CONVEX_URL",
  ];
  if (previewName) {
    args.push("--preview-name", previewName);
  }
  if (skipWorkosCheck) {
    args.push("--skip-workos-check");
  }
  return args;
}

export function resolveWorkosRedirectUri(config, env = process.env) {
  const vercelEnv = configuredValue(env.VERCEL_ENV) || "development";

  if (vercelEnv === "production") {
    const uri = config.authKit?.prod?.configure?.redirectUris?.[0];
    if (!uri) {
      throw new Error(
        "convex.json is missing authKit.prod.configure.redirectUris[0]",
      );
    }
    return uri;
  }

  if (vercelEnv === "preview") {
    const branchUrl = configuredValue(env.VERCEL_BRANCH_URL);
    const deploymentUrl = configuredValue(env.VERCEL_URL);
    const origin = httpsOrigin(
      branchUrl || deploymentUrl,
      branchUrl ? "VERCEL_BRANCH_URL" : "VERCEL_URL",
    );
    return `${origin}/callback`;
  }

  return (
    config.authKit?.dev?.localEnvVars?.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??
    "http://localhost:4271/callback"
  );
}
