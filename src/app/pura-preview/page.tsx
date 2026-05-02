import type { Metadata } from "next";

import { headers } from "next/headers";

import DomainRouterNotFound from "@/app/domain-router/[domain]/not-found";
import { PortalSidebarOverrideProvider } from "@/app/portal/PortalSidebarOverride";
import { PortalAiChatPreviewClient } from "@/app/portal/app/pura-preview/PortalAiChatPreviewClient";
import { buildCustomDomainNotFoundMetadata, hostnameFromHeader, isPlatformHostname } from "@/lib/customDomainMetadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host) && host) {
    return buildCustomDomainNotFoundMetadata(host);
  }

  return {
    title: "Pura Preview | Purely Automation",
    description: "Preview the Pura chat experience.",
  };
}

export default async function PublicPuraPreviewPage() {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host)) {
    return <DomainRouterNotFound />;
  }

  return (
    <PortalSidebarOverrideProvider>
      <PortalAiChatPreviewClient standalone />
    </PortalSidebarOverrideProvider>
  );
}
