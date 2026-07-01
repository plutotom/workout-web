import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@serwist/turbopack"],
};

export default withSerwist(nextConfig);
