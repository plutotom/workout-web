import { PolarCore } from "@polar-sh/sdk/core.js";

/** Polar date-based API version we pin until we migrate to a later contract. */
export const POLAR_API_VERSION = "2026-04" as const;

export const POLAR_VERSION_HEADER = "Polar-Version";
export const POLAR_WEBHOOK_API_VERSION_HEADER = "webhook-api-version";

const POLAR_PRODUCTION_API = "https://api.polar.sh";
const POLAR_SANDBOX_API = "https://sandbox-api.polar.sh";
const POLAR_EVENTS_PATH = "/polar/events";

type PolarCreateRequest = PolarCore["_createRequest"];

let polarSdkPinned = false;

export function polarApiBaseUrl(
  server: string | undefined = process.env.POLAR_SERVER,
): string {
  return server === "production" ? POLAR_PRODUCTION_API : POLAR_SANDBOX_API;
}

export function withPolarVersionHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  if (!next.has(POLAR_VERSION_HEADER)) {
    next.set(POLAR_VERSION_HEADER, POLAR_API_VERSION);
  }
  return next;
}

/**
 * Patch PolarCore so every SDK request (checkout, portal, customers, product
 * sync in this isolate) sends Polar-Version. @convex-dev/polar constructs
 * PolarCore internally and does not expose an httpClient option.
 */
export function pinPolarSdkApiVersion(): void {
  if (polarSdkPinned) return;
  polarSdkPinned = true;

  const original = PolarCore.prototype._createRequest;
  PolarCore.prototype._createRequest = function (
    this: PolarCore,
    context: Parameters<PolarCreateRequest>[0],
    conf: Parameters<PolarCreateRequest>[1],
    options?: Parameters<PolarCreateRequest>[2],
  ) {
    return original.call(
      this,
      context,
      { ...conf, headers: withPolarVersionHeaders(conf.headers) },
      options,
    );
  };
}

export function pinPolarClientApiVersion(client: PolarCore): void {
  const original = client._createRequest.bind(client);
  client._createRequest = ((
    context: Parameters<PolarCreateRequest>[0],
    conf: Parameters<PolarCreateRequest>[1],
    options?: Parameters<PolarCreateRequest>[2],
  ) =>
    original(
      context,
      {
        ...conf,
        headers: withPolarVersionHeaders(conf.headers),
      },
      options,
    )) as PolarCreateRequest;
}

export function webhookApiVersionFrom(source: unknown): string | null {
  if (source instanceof Headers) {
    return source.get(POLAR_WEBHOOK_API_VERSION_HEADER);
  }
  if (typeof source !== "object" || source === null) return null;
  const record = source as Record<string, unknown>;
  if (typeof record.apiVersion === "string" && record.apiVersion.length > 0) {
    return record.apiVersion;
  }
  if (typeof record.api_version === "string" && record.api_version.length > 0) {
    return record.api_version;
  }
  return null;
}

export function warnIfUnexpectedPolarWebhookVersion(
  version: string | null,
): void {
  if (version && version !== POLAR_API_VERSION) {
    console.warn(
      `Polar webhook api_version ${version} does not match pinned ${POLAR_API_VERSION}`,
    );
  }
}

export type PolarWebhookEndpoint = {
  id: string;
  url: string;
  api_version?: string;
  apiVersion?: string;
};

export type PinPolarWebhookResult = {
  scanned: number;
  pinned: string[];
  alreadyPinned: string[];
  skipped: string[];
};

function endpointApiVersion(
  endpoint: PolarWebhookEndpoint,
): string | undefined {
  return endpoint.api_version ?? endpoint.apiVersion;
}

export function shouldPinPolarEventsEndpoint(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith(POLAR_EVENTS_PATH);
  } catch {
    return url.includes(POLAR_EVENTS_PATH);
  }
}

export async function polarFetch(
  path: string,
  init: RequestInit = {},
  options: {
    fetchImpl?: typeof fetch;
    token?: string;
    server?: string;
  } = {},
): Promise<Response> {
  const token = options.token ?? process.env.POLAR_ORGANIZATION_TOKEN?.trim();
  if (!token) {
    throw new Error("POLAR_ORGANIZATION_TOKEN is not set");
  }
  const headers = withPolarVersionHeaders(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  return await fetchImpl(`${polarApiBaseUrl(options.server)}${path}`, {
    ...init,
    headers,
  });
}

async function readPolarJson(
  response: Response,
  action: string,
): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Polar ${action} failed (${response.status}): ${text}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Polar ${action} returned non-JSON`);
  }
}

function webhookEndpointFromUnknown(
  value: unknown,
): PolarWebhookEndpoint | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.url !== "string") {
    return null;
  }
  return {
    id: record.id,
    url: record.url,
    ...(typeof record.api_version === "string"
      ? { api_version: record.api_version }
      : {}),
    ...(typeof record.apiVersion === "string"
      ? { apiVersion: record.apiVersion }
      : {}),
  };
}

async function listPolarWebhookEndpoints(options: {
  fetchImpl?: typeof fetch;
  token?: string;
  server?: string;
}): Promise<PolarWebhookEndpoint[]> {
  const endpoints: PolarWebhookEndpoint[] = [];
  let page = 1;
  let maxPage = 1;
  do {
    const response = await polarFetch(
      `/v1/webhooks/endpoints/?page=${page}&limit=100`,
      { method: "GET" },
      options,
    );
    const payload = await readPolarJson(response, "list webhook endpoints");
    if (typeof payload !== "object" || payload === null) {
      throw new Error(
        "Polar list webhook endpoints returned an unexpected body",
      );
    }
    const record = payload as {
      items?: unknown;
      pagination?: { max_page?: unknown; maxPage?: unknown };
    };
    const items = Array.isArray(record.items) ? record.items : [];
    for (const item of items) {
      const endpoint = webhookEndpointFromUnknown(item);
      if (endpoint) endpoints.push(endpoint);
    }
    const paginationMax =
      record.pagination?.max_page ?? record.pagination?.maxPage;
    maxPage = typeof paginationMax === "number" ? paginationMax : page;
    page += 1;
  } while (page <= maxPage);
  return endpoints;
}

/** Pin Convex /polar/events webhook endpoints to the frozen 2026-04 contract. */
export async function pinPolarWebhookEndpoints(
  options: {
    fetchImpl?: typeof fetch;
    token?: string;
    server?: string;
  } = {},
): Promise<PinPolarWebhookResult> {
  const result: PinPolarWebhookResult = {
    scanned: 0,
    pinned: [],
    alreadyPinned: [],
    skipped: [],
  };
  const endpoints = await listPolarWebhookEndpoints(options);
  result.scanned = endpoints.length;

  for (const endpoint of endpoints) {
    if (!shouldPinPolarEventsEndpoint(endpoint.url)) {
      result.skipped.push(endpoint.id);
      continue;
    }
    if (endpointApiVersion(endpoint) === POLAR_API_VERSION) {
      result.alreadyPinned.push(endpoint.id);
      continue;
    }
    const response = await polarFetch(
      `/v1/webhooks/endpoints/${endpoint.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ api_version: POLAR_API_VERSION }),
      },
      options,
    );
    await readPolarJson(response, `pin webhook endpoint ${endpoint.id}`);
    result.pinned.push(endpoint.id);
  }
  return result;
}
