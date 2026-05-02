import type { Metadata } from "next";

import { headers } from "next/headers";

import { generateMetadata as generateDomainRouterMetadata } from "@/app/domain-router/[domain]/[[...path]]/page";
import { MarketingLanding } from "@/components/marketing/MarketingLanding";
import DomainRouterCatchallPage from "@/app/domain-router/[domain]/[[...path]]/page";
import { PLATFORM_METADATA, hostnameFromHeader, isPlatformHostname } from "@/lib/customDomainMetadata";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host) && host) {
    return generateDomainRouterMetadata({
      params: Promise.resolve({ domain: encodeURIComponent(host), path: [] }),
    });
  }

  return PLATFORM_METADATA;
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
