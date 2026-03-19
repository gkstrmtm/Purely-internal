import { NextResponse } from "next/server";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { groupPortalServices } from "@/app/portal/services/categories";
import { requirePortalUser } from "@/lib/portalAuth";

export async function GET() {
  await requirePortalUser();

  const services = PORTAL_SERVICES.filter((s) => !s.variants || s.variants.includes("portal"));
  const groups = groupPortalServices(services).map((g) => ({
    key: g.key,
    title: g.title,
    services: g.services.map((s) => ({
      slug: s.slug,
      title: s.title,
      description: s.description,
      accent: s.accent,
      hidden: Boolean(s.hidden),
      included: Boolean(s.included),
      entitlementKey: s.entitlementKey ?? null,
    })),
  }));

  return NextResponse.json({ ok: true, groups });
}
