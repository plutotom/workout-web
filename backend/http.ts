import { httpRouter } from "convex/server";

import {
  warnIfUnexpectedPolarWebhookVersion,
  webhookApiVersionFrom,
} from "./lib/polar_api_version";
import { polar, syncUserPlanFromPolarEvent } from "./routes/billing/polar";
import { pull as syncPull, push as syncPush } from "./routes/sync/http";

const http = httpRouter();

http.route({
  path: "/sync/push",
  method: "POST",
  handler: syncPush,
});

http.route({
  path: "/sync/pull",
  method: "GET",
  handler: syncPull,
});

polar.registerRoutes(http, {
  path: "/polar/events",
  events: {
    "subscription.created": async (ctx, event) => {
      warnIfUnexpectedPolarWebhookVersion(webhookApiVersionFrom(event));
      await syncUserPlanFromPolarEvent(
        ctx as Parameters<typeof syncUserPlanFromPolarEvent>[0],
        event.data,
      );
    },
    "subscription.updated": async (ctx, event) => {
      warnIfUnexpectedPolarWebhookVersion(webhookApiVersionFrom(event));
      await syncUserPlanFromPolarEvent(
        ctx as Parameters<typeof syncUserPlanFromPolarEvent>[0],
        event.data,
      );
    },
  },
});

export default http;
