import type { Metadata } from "next";

import { Suspense } from "react";
import { headers } from "next/headers";

import DomainRouterNotFound from "@/app/domain-router/[domain]/not-found";
import { PLATFORM_METADATA, buildCustomDomainNotFoundMetadata, hostnameFromHeader, isPlatformHostname } from "@/lib/customDomainMetadata";

import EmployeeLoginClient from "./EmployeeLoginClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host) && host) {
    return buildCustomDomainNotFoundMetadata(host);
  }

  return PLATFORM_METADATA;
}

export default async function EmployeeLoginPage() {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host)) {
    return <DomainRouterNotFound />;
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-mist text-brand-ink">
          <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12" />
        </div>
      }
    >
      <EmployeeLoginClient />
    </Suspense>
  );
}
