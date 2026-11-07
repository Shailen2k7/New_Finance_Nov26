import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pdf-parse", "@electric-sql/pglite", "postgres"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
