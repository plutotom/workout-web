import type { AuthConfig } from "convex/server";

const workosClientId = process.env.WORKOS_CLIENT_ID;
const clerkIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim();

const providers: AuthConfig["providers"] = [
  {
    type: "customJwt",
    issuer: "https://api.workos.com/",
    algorithm: "RS256",
    jwks: `https://api.workos.com/sso/jwks/${workosClientId}`,
    applicationID: workosClientId,
  },
  {
    type: "customJwt",
    issuer: `https://api.workos.com/user_management/${workosClientId}`,
    algorithm: "RS256",
    jwks: `https://api.workos.com/sso/jwks/${workosClientId}`,
  },
];

if (clerkIssuerDomain) {
  providers.push({
    domain: clerkIssuerDomain,
    applicationID: "convex",
  });
}

const authConfig: AuthConfig = {
  providers,
};

export default authConfig;
