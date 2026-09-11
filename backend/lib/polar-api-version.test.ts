import { PolarCore } from "@polar-sh/sdk/core.js";
import { describe, expect, it, vi } from "vitest";

import {
  POLAR_API_VERSION,
  POLAR_VERSION_HEADER,
  pinPolarClientApiVersion,
  pinPolarSdkApiVersion,
  pinPolarWebhookEndpoints,
  polarApiBaseUrl,
  shouldPinPolarEventsEndpoint,
  warnIfUnexpectedPolarWebhookVersion,
  webhookApiVersionFrom,
  withPolarVersionHeaders,
} from "./polar-api-version";

describe("withPolarVersionHeaders", () => {
  it("pins Polar-Version when the header is missing", () => {
    const headers = withPolarVersionHeaders({ Accept: "application/json" });
    expect(headers.get(POLAR_VERSION_HEADER)).toBe(POLAR_API_VERSION);
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("does not overwrite an explicit Polar-Version", () => {
    const headers = withPolarVersionHeaders({
      [POLAR_VERSION_HEADER]: "2026-10",
    });
    expect(headers.get(POLAR_VERSION_HEADER)).toBe("2026-10");
  });
});

describe("polarApiBaseUrl", () => {
  it("uses production only when POLAR_SERVER is production", () => {
    expect(polarApiBaseUrl("production")).toBe("https://api.polar.sh");
    expect(polarApiBaseUrl("sandbox")).toBe("https://sandbox-api.polar.sh");
    expect(polarApiBaseUrl(undefined)).toBe("https://sandbox-api.polar.sh");
  });
});

describe("shouldPinPolarEventsEndpoint", () => {
  it("matches Convex Polar webhook paths", () => {
    expect(
      shouldPinPolarEventsEndpoint(
        "https://happy-animal-123.convex.site/polar/events",
      ),
    ).toBe(true);
    expect(shouldPinPolarEventsEndpoint("https://webhook.site/abc")).toBe(
      false,
    );
  });
});

describe("webhookApiVersionFrom", () => {
  it("reads the delivery header and payload fields", () => {
    expect(
      webhookApiVersionFrom(
        new Headers({ "webhook-api-version": POLAR_API_VERSION }),
      ),
    ).toBe(POLAR_API_VERSION);
    expect(webhookApiVersionFrom({ api_version: "2026-10" })).toBe("2026-10");
    expect(webhookApiVersionFrom({ apiVersion: POLAR_API_VERSION })).toBe(
      POLAR_API_VERSION,
    );
    expect(webhookApiVersionFrom({})).toBeNull();
  });
});

describe("warnIfUnexpectedPolarWebhookVersion", () => {
  it("warns only when Polar sends a different api_version", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfUnexpectedPolarWebhookVersion(null);
    warnIfUnexpectedPolarWebhookVersion(POLAR_API_VERSION);
    warnIfUnexpectedPolarWebhookVersion("2026-10");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("pinPolarClientApiVersion", () => {
  it("injects Polar-Version into PolarCore request headers", () => {
    pinPolarSdkApiVersion();
    const client = new PolarCore({
      accessToken: "polar_oat_test",
      server: "sandbox",
    });
    pinPolarClientApiVersion(client);
    const request = client._createRequest(
      {
        baseURL: new URL("https://sandbox-api.polar.sh/"),
        operationID: "productsList",
        oAuth2Scopes: [],
        resolvedSecurity: null,
        options: {},
        retryConfig: { strategy: "none" },
      },
      {
        method: "GET",
        path: "/v1/products/",
      },
    );
    if (!request.ok) {
      throw request.error;
    }
    expect(request.value.headers.get(POLAR_VERSION_HEADER)).toBe(
      POLAR_API_VERSION,
    );
  });
});

describe("pinPolarWebhookEndpoints", () => {
  it("PATCHes Convex Polar event endpoints that are not on 2026-04", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v1/webhooks/endpoints/?page=")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "wh_events",
                  url: "https://happy-animal-123.convex.site/polar/events",
                  api_version: "2026-10",
                },
                {
                  id: "wh_already",
                  url: "https://happy-animal-123.convex.site/polar/events",
                  api_version: POLAR_API_VERSION,
                },
                {
                  id: "wh_other",
                  url: "https://example.com/hooks",
                  api_version: "2026-10",
                },
              ],
              pagination: { total_count: 3, max_page: 1 },
            }),
            { status: 200 },
          );
        }
        if (
          url.endsWith("/v1/webhooks/endpoints/wh_events") &&
          init?.method === "PATCH"
        ) {
          expect(JSON.parse(String(init.body))).toEqual({
            api_version: POLAR_API_VERSION,
          });
          const headers = new Headers(init.headers);
          expect(headers.get(POLAR_VERSION_HEADER)).toBe(POLAR_API_VERSION);
          return new Response(JSON.stringify({ id: "wh_events" }), {
            status: 200,
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      },
    );

    const result = await pinPolarWebhookEndpoints({
      fetchImpl: fetchImpl as typeof fetch,
      token: "polar_oat_test",
      server: "sandbox",
    });

    expect(result).toEqual({
      scanned: 3,
      pinned: ["wh_events"],
      alreadyPinned: ["wh_already"],
      skipped: ["wh_other"],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
