export type PortalVariant = "portal" | "credit";

export const PORTAL_VARIANT_HEADER = "x-portal-variant";

type HeadersLike = {
  get(name: string): string | null;
};

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

export function portalVariantFromCookieHeader(
  cookieHeader: string | null | undefined,
  opts: { portalCookieName?: string; creditCookieName?: string } = {},
): PortalVariant | null {
  const raw = String(cookieHeader || "").trim();
  if (!raw) return null;

  const portalCookieName = opts.portalCookieName || "pa.portal.session";
  const creditCookieName = opts.creditCookieName || "pa.credit.session";
  const names = new Set(
    raw
      .split(";")
      .map((part) => part.split("=")[0]?.trim())
      .filter(Boolean),
  );

  const hasPortal = names.has(portalCookieName);
  const hasCredit = names.has(creditCookieName);
  if (hasPortal === hasCredit) return null;
  return hasCredit ? "credit" : "portal";
}

export function resolvePortalVariantFromRequestHeaders(
  headers: HeadersLike,
  opts: { portalCookieName?: string; creditCookieName?: string; defaultVariant?: PortalVariant } = {},
): PortalVariant | null {
  const explicit = normalizePortalVariant(headers.get(PORTAL_VARIANT_HEADER));
  if (explicit) return explicit;

  const cookieVariant = portalVariantFromCookieHeader(headers.get("cookie"), opts);
  if (cookieVariant) return cookieVariant;

  const referer = String(headers.get("referer") || "").trim();
  if (referer) {
    try {
      return portalVariantFromPathname(new URL(referer).pathname || "");
    } catch {
      return portalVariantFromPathname(referer);
    }
  }

  return opts.defaultVariant ?? null;
}
