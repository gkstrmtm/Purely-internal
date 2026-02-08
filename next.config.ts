import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Prevent Next from inferring an incorrect workspace root when multiple
    // lockfiles exist elsewhere on disk.
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/hooks/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;
