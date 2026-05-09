import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { hasPublicColumn } from "@/lib/dbSchema";

export const PLATFORM_METADATA: Metadata = {
  title: "Purely Automation",
  description: "Automation systems for businesses so you can focus on higher leverage tasks.",
  metadataBase: new URL("https://purelyautomation.com"),
  openGraph: {
    title: "Purely Automation",
    description: "Automation systems for businesses so you can focus on higher leverage tasks.",
    url: "/",
    siteName: "Purely Automation",
    images: [{ url: "/opengraph-image.svg", width: 1200, height: 630, alt: "Purely Automation" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Purely Automation",
    description: "Automation systems for businesses so you can focus on higher leverage tasks.",
    images: ["/opengraph-image.svg"],
  },
};

function normalizedPlatformBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_CANONICAL_URL || process.env.APP_CANONICAL_URL || "https://purelyautomation.com";
  return raw.replace(/\/+$/g, "");
}

export function hostnameFromHeader(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase() || "";
  if (!first) return null;
  return first.replace(/:\d+$/, "");
}

export function isPlatformHostname(host: string | null): boolean {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h === "purelyautomation.com" || h.endsWith(".purelyautomation.com")) return true;
  if (h.endsWith(".vercel.app")) return true;
  return false;
}

function metadataBaseForHost(host: string) {
  const normalizedHost = String(host || "").trim().toLowerCase();
  const protocol = normalizedHost === "localhost" || normalizedHost === "127.0.0.1" ? "http" : "https";
  return new URL(`${protocol}://${normalizedHost}`);
}

export function platformMetadataBase() {
  return new URL(normalizedPlatformBaseUrl());
}

export function buildPlatformHostedMetadata({
  siteName,
  title,
  description,
  path,
  imageUrl,
  iconUrl,
  keywords,
  noIndex,
  type,
}: {
  siteName: string;
  title: string;
  description?: string;
  path?: string;
  imageUrl?: string | null;
  iconUrl?: string | null;
  keywords?: string[];
  noIndex?: boolean;
  type?: "website" | "article";
}): Metadata {
  const canonicalPath = path && path.startsWith("/") ? path : path ? `/${path}` : "/";
  const resolvedIconUrl = iconUrl || "/icon";
  const socialImageUrl = imageUrl || resolvedIconUrl || undefined;
  const metadataBase = platformMetadataBase();
  return {
    title,
    description,
    metadataBase,
    alternates: { canonical: canonicalPath },
    keywords: Array.isArray(keywords) && keywords.length ? keywords : undefined,
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName,
      images: socialImageUrl ? [{ url: socialImageUrl }] : undefined,
      type: type || "website",
    },
    twitter: {
      card: socialImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: socialImageUrl ? [socialImageUrl] : undefined,
    },
    icons: resolvedIconUrl
      ? {
          icon: resolvedIconUrl,
          shortcut: resolvedIconUrl,
          apple: resolvedIconUrl,
        }
      : undefined,
    robots: noIndex ? { index: false, follow: false } : undefined,
  };
}

export type CustomDomainBranding = {
  ownerId: string | null;
  siteName: string;
  logoUrl: string | null;
};

export async function resolveCustomDomainBranding(host: string): Promise<CustomDomainBranding> {
  const mapping = await resolveCustomDomain(host).catch(() => null);
  if (!mapping || mapping.status !== "VERIFIED") {
    return { ownerId: null, siteName: host, logoUrl: null };
  }

  const canUseLogoUrl = await hasPublicColumn("BusinessProfile", "logoUrl").catch(() => false);
  const select: Record<string, boolean> = { businessName: true };
  if (canUseLogoUrl) select.logoUrl = true;

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: mapping.ownerId }, select: select as any })
    .catch(() => null);

  const rawBusinessName = typeof (profile as any)?.businessName === "string" ? String((profile as any).businessName).trim() : "";
  const siteName = rawBusinessName || host;
  const logoUrl = typeof (profile as any)?.logoUrl === "string" && (profile as any).logoUrl.trim() ? String((profile as any).logoUrl).trim() : null;

  return {
    ownerId: mapping.ownerId,
    siteName,
    logoUrl,
  };
}

export function buildCustomDomainMetadata({
  host,
  siteName,
  title,
  description,
  imageUrl,
  iconUrl,
  noIndex,
  path,
  keywords,
  type,
}: {
  host: string;
  siteName: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
  iconUrl?: string | null;
  noIndex?: boolean;
  path?: string;
  keywords?: string[];
  type?: "website" | "article";
}): Metadata {
  const resolvedIconUrl = iconUrl || "/icon";
  const socialImageUrl = imageUrl || resolvedIconUrl || undefined;
  const canonicalPath = path && path.startsWith("/") ? path : path ? `/${path}` : "/";
  return {
    title,
    description,
    metadataBase: metadataBaseForHost(host),
    alternates: { canonical: canonicalPath },
    keywords: Array.isArray(keywords) && keywords.length ? keywords : undefined,
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName,
      images: socialImageUrl ? [{ url: socialImageUrl }] : undefined,
      type: type || "website",
    },
    twitter: {
      card: socialImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: socialImageUrl ? [socialImageUrl] : undefined,
    },
    icons: resolvedIconUrl
      ? {
          icon: resolvedIconUrl,
          shortcut: resolvedIconUrl,
          apple: resolvedIconUrl,
        }
      : undefined,
    robots: noIndex ? { index: false, follow: false } : undefined,
  };
}

export async function buildCustomDomainDirectoryMetadata(host: string): Promise<Metadata> {
  const branding = await resolveCustomDomainBranding(host);
  return buildCustomDomainMetadata({
    host,
    siteName: branding.siteName,
    title: branding.siteName,
    description: "Only hosted pages for this custom domain are available here.",
    imageUrl: branding.logoUrl,
    iconUrl: branding.logoUrl,
  });
}

export async function buildCustomDomainNotFoundMetadata(host: string): Promise<Metadata> {
  const branding = await resolveCustomDomainBranding(host);
  return buildCustomDomainMetadata({
    host,
    siteName: branding.siteName,
    title: `${branding.siteName} | Page not found`,
    description: "This custom domain only serves hosted pages configured for this business.",
    imageUrl: branding.logoUrl,
    iconUrl: branding.logoUrl,
    noIndex: true,
  });
}
