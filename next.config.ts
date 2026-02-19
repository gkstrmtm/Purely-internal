import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Prevent Next from inferring an incorrect workspace root when multiple
    // lockfiles exist elsewhere on disk.
    root: __dirname,
  },
  async redirects() {
    return [
      {
        source: "/credit",
        destination: "/credit/portal",
        permanent: false,
      },
      {
        source: "/credit/",
        destination: "/credit/portal",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const rewrites: Array<{ source: string; destination: string }> = [
      {
        source: "/hooks/:path*",
        destination: "/:path*",
      },

    ];

    // Optional multi-zone: route /credit/* to an independent credit portal deployment.
    // This allows purelyautomation.com/credit/... without sharing DB/users.
    const creditOrigin = String(process.env.CREDIT_PORTAL_ORIGIN || "").trim().replace(/\/$/, "");
    if (creditOrigin) {
      rewrites.unshift({
        source: "/credit/:path*",
        destination: `${creditOrigin}/:path*`,
      });
    }

    return rewrites;
  },
};

export default nextConfig;
