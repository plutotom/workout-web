import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { validateMcpApiKey } from "@/lib/mcp/convex";
import { registerWorkoutMcpTools } from "@/lib/mcp/tools";

export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerWorkoutMcpTools(server);
  },
  {
    serverInfo: { name: "workout-web", version: "0.1.0" },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    disableSse: true,
  },
);

async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const result = await validateMcpApiKey(bearerToken);
  if (!result) return undefined;
  return {
    token: bearerToken,
    clientId: result.userId,
    scopes: ["mcp"],
    extra: { userId: result.userId, email: result.email },
  };
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
