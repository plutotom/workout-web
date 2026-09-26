const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function planFromSubscriptionStatus(status: string): "free" | "pro" {
  return ACTIVE_STATUSES.has(status) ? "pro" : "free";
}

export function extractUserIdFromSubscription(data: {
  customer?: {
    metadata?: Record<string, unknown>;
    externalId?: string | null;
    external_id?: string | null;
  };
}): string | null {
  const metaUserId = data.customer?.metadata?.userId;
  if (typeof metaUserId === "string" && metaUserId.length > 0) {
    return metaUserId;
  }
  const camel = data.customer?.externalId;
  if (typeof camel === "string" && camel.length > 0) return camel;
  const snake = data.customer?.external_id;
  if (typeof snake === "string" && snake.length > 0) return snake;
  return null;
}
