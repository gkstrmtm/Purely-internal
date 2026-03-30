import type { Metadata } from "next";

import { headers } from "next/headers";

import { MarketingLanding } from "@/components/marketing/MarketingLanding";
import DomainRouterCatchallPage from "@/app/domain-router/[domain]/[[...path]]/page";

export const metadata: Metadata = {
  title: "Purely Automation",
  description: "Automation systems for businesses so you can focus on higher leverage tasks.",
};

function hostnameFromHeader(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase() || "";
  if (!first) return null;
  return first.replace(/:\d+$/, "");
}

function isPlatformHostname(host: string | null): boolean {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h === "purelyautomation.com" || h.endsWith(".purelyautomation.com")) return true;
  if (h.endsWith(".vercel.app")) return true;
  return false;
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host)) {
    return DomainRouterCatchallPage({
      params: Promise.resolve({ domain: encodeURIComponent(host || ""), path: [] }),
      searchParams,
    });
  }

  return <MarketingLanding />;
}
