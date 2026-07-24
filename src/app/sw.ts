/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Never persist authenticated navigation/RSC/API data or any
      // cross-origin response (including Convex traffic) in Cache Storage.
      matcher: ({ request, sameOrigin, url: { pathname } }) =>
        !sameOrigin ||
        pathname.startsWith("/api/") ||
        request.mode === "navigate" ||
        request.destination === "document" ||
        request.headers.get("RSC") === "1",
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

const PRIVATE_CACHE_NAMES = [
  "apis",
  "cross-origin",
  "next-data",
  "others",
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "static-data-assets",
];

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all(PRIVATE_CACHE_NAMES.map((name) => caches.delete(name))),
  );
});

serwist.addEventListeners();
