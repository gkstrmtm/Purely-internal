import "server-only";

import { headers } from "next/headers";

import type { PortalVariant } from "./portalVariant";
import { normalizePortalVariant, portalVariantFromPathname, PORTAL_VARIANT_HEADER } from "./portalVariant";

export async function requestPortalVariant(fallback: PortalVariant = "portal"): Promise<PortalVariant> {
  const h = await headers();
  const headerVariant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER));
  if (headerVariant) return headerVariant;

  const referer = h.get("referer");
  if (referer) {
    try {
      return portalVariantFromPathname(new URL(referer).pathname);
    } catch {
      // ignore malformed referer and fall through to the default
    }
  }

  return fallback;
}

export async function requestPortalAppBasePath(fallback: PortalVariant = "portal"): Promise<"/portal/app" | "/credit/app"> {
  const v = await requestPortalVariant(fallback);
  return v === "credit" ? "/credit/app" : "/portal/app";
}
