import { headers } from "next/headers";

import DomainRouterNotFound from "@/app/domain-router/[domain]/not-found";
import { hostnameFromHeader, isPlatformHostname } from "@/lib/customDomainMetadata";

export default async function Dashboard() {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host)) {
    return <DomainRouterNotFound />;
  }

  return null;
}
