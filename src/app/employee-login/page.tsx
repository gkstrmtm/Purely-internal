import type { Metadata } from "next";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import DomainRouterNotFound from "@/app/domain-router/[domain]/not-found";
import { PLATFORM_METADATA, buildCustomDomainNotFoundMetadata, hostnameFromHeader, isPlatformHostname } from "@/lib/customDomainMetadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host) && host) {
    return buildCustomDomainNotFoundMetadata(host);
  }

  return PLATFORM_METADATA;
}

export default async function EmployeeLoginAliasPage() {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host)) {
    return <DomainRouterNotFound />;
  }

  redirect("/employeelogin");
}
