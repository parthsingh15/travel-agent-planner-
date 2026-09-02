import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows a production build to run alongside a dev server without the two
  // clobbering each other's `.next` output (set NEXT_DIST_DIR to isolate).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
