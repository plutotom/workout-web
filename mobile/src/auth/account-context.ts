import { createContext } from "react";

export type MobileAccountStatus = "offline" | "connecting" | "ready" | "error";

export const MobileAccountContext = createContext<{
  status: MobileAccountStatus;
  retry: () => Promise<void>;
} | null>(null);
