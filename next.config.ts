import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pdf-parse", "@electric-sql/pglite", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Pages you opened in the last 30 seconds reopen instantly; any save refreshes them.
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default nextConfig;
