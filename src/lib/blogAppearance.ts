import { prisma } from "@/lib/db";
import { normalizeHostedFontKey } from "@/lib/portalHostedFonts";

const SERVICE_SLUG = "blog_appearance";

export type BlogAppearance = {
  version: 1;
  useBrandFont: boolean;
  titleFontKey: string;
  bodyFontKey: string;
};

const DEFAULT_APPEARANCE: BlogAppearance = {
  version: 1,
  useBrandFont: true,
  titleFontKey: "brand",
  bodyFontKey: "brand",
};

function parseAppearance(raw: unknown): BlogAppearance {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

  const useBrandFont = typeof rec?.useBrandFont === "boolean" ? rec.useBrandFont : DEFAULT_APPEARANCE.useBrandFont;
  const titleFontKey = normalizeHostedFontKey(rec?.titleFontKey);
  const bodyFontKey = normalizeHostedFontKey(rec?.bodyFontKey);

  return {
    version: 1,
    useBrandFont,
    titleFontKey,
    bodyFontKey,
  };
}

export async function getBlogAppearance(ownerId: string): Promise<BlogAppearance> {
  const cleanOwnerId = String(ownerId || "").trim();
  if (!cleanOwnerId) return DEFAULT_APPEARANCE;

  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId: cleanOwnerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseAppearance(row?.dataJson);
}

export async function setBlogAppearance(ownerId: string, next: Partial<BlogAppearance>): Promise<BlogAppearance> {
  const cleanOwnerId = String(ownerId || "").trim();
  if (!cleanOwnerId) return DEFAULT_APPEARANCE;

  const existing = await getBlogAppearance(cleanOwnerId);

  const merged: BlogAppearance = {
    version: 1,
    useBrandFont: typeof next.useBrandFont === "boolean" ? next.useBrandFont : existing.useBrandFont,
    titleFontKey: normalizeHostedFontKey(next.titleFontKey ?? existing.titleFontKey),
    bodyFontKey: normalizeHostedFontKey(next.bodyFontKey ?? existing.bodyFontKey),
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId: cleanOwnerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId: cleanOwnerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: merged },
    update: { status: "COMPLETE", dataJson: merged },
    select: { ownerId: true },
  });

  return merged;
}
