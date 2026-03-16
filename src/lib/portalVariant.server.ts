import "server-only";

import { headers } from "next/headers";

import type { PortalVariant } from "./portalVariant";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "./portalVariant";

export async function requestPortalVariant(fallback: PortalVariant = "portal"): Promise<PortalVariant> {
  const h = await headers();
  return normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) ?? fallback;
}

export async function requestPortalAppBasePath(fallback: PortalVariant = "portal"): Promise<"/portal/app" | "/credit/app"> {
  const v = await requestPortalVariant(fallback);
  return v === "credit" ? "/credit/app" : "/portal/app";
}
