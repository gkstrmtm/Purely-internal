import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
