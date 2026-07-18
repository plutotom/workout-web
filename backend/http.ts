import { httpRouter } from "convex/server";

import { polar, syncUserPlanFromPolarEvent } from "./routes/billing/polar";

const http = httpRouter();

polar.registerRoutes(http, {
  path: "/polar/events",
  events: {
    "subscription.created": async (ctx, event) => {
      await syncUserPlanFromPolarEvent(
        ctx as Parameters<typeof syncUserPlanFromPolarEvent>[0],
        event.data,
      );
    },
    "subscription.updated": async (ctx, event) => {
      await syncUserPlanFromPolarEvent(
        ctx as Parameters<typeof syncUserPlanFromPolarEvent>[0],
        event.data,
      );
    },
  },
});

export default http;
