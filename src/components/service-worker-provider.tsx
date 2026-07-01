"use client";

import { useEffect } from "react";

export function ServiceWorkerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/serwist/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  }, []);

  return children;
}
