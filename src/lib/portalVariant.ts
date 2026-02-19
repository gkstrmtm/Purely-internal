export type PortalVariant = "portal" | "credit";

export const PORTAL_VARIANT_HEADER = "x-portal-variant";

export function normalizePortalVariant(raw: unknown): PortalVariant | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "portal" || v === "main") return "portal";
  if (v === "credit") return "credit";
  return null;
}

export function portalVariantFromPathname(pathname: string): PortalVariant {
  return pathname === "/credit" || pathname.startsWith("/credit/") ? "credit" : "portal";
}

export function portalBasePath(variant: PortalVariant): "/portal" | "/credit" {
  return variant === "credit" ? "/credit" : "/portal";
}
