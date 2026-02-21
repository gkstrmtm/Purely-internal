import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { requirePortalUser, requirePortalUserForAnyService, requirePortalUserForService } from "@/lib/portalAuth";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { PortalServicePageClient } from "@/app/portal/services/[service]/PortalServicePageClient";
import { PORTAL_SERVICE_KEYS } from "@/lib/portalPermissions.shared";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

const KNOWN_KEYS = new Set<string>(PORTAL_SERVICE_KEYS as unknown as string[]);

function serviceKeysForSlug(slug: string): readonly string[] | null {
  switch (slug) {
    case "inbox":
      return ["inbox", "outbox"] as const;
    case "media-library":
      return ["media"] as const;
    case "ai-receptionist":
      return ["aiReceptionist"] as const;
    case "lead-scraping":
      return ["leadScraping"] as const;
    case "missed-call-textback":
      return ["missedCallTextback"] as const;
    case "follow-up":
      return ["followUp"] as const;
    default:
      // Most slugs map 1:1 (blogs, booking, automations, tasks, reviews, reporting, etc.)
      return KNOWN_KEYS.has(slug) ? ([slug] as const) : null;
  }
}

export default async function PortalAppServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) ?? "portal";

  const { service } = await params;
  const serviceRec = PORTAL_SERVICES.find((s) => s.slug === service) ?? null;
  if (!serviceRec) notFound();
  if (serviceRec.variants && !serviceRec.variants.includes(variant)) notFound();

  const keys = serviceKeysForSlug(service);
  if (!keys) {
    await requirePortalUser();
  } else if (keys.length === 1) {
    await requirePortalUserForService(keys[0] as any, "view");
  } else {
    await requirePortalUserForAnyService(keys as any, "view");
  }

  return <PortalServicePageClient slug={service} />;
}
