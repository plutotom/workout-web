import { ConvexHttpClient } from "convex/browser";

import { api } from "@backend/api";

let client: ConvexHttpClient | null = null;

export function getMcpConvexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  if (!client) client = new ConvexHttpClient(url);
  return client;
}

export async function validateMcpApiKey(apiKey: string) {
  return getMcpConvexClient().query(api.routes.mcp.queries.validateApiKey, {
    apiKey,
  });
}
