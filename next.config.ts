import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    // Prevent Next from inferring an incorrect workspace root when multiple
    // lockfiles exist elsewhere on disk.
    root: __dirname,
  },
  async redirects() {
    return [];
  },
  async rewrites() {
    const rewrites: Array<{ source: string; destination: string }> = [
      {
        source: "/hooks/:path*",
        destination: "/:path*",
      },
    ];

    return rewrites;
  },
};

export default nextConfig;
