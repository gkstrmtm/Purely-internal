import type { MetadataRoute } from "next";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://purelyautomation.com";
  const now = new Date();

  const serviceUrls = PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => ({
    url: `${base}/services/${encodeURIComponent(s.slug)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const canUseSiteSlugColumn = await hasPublicColumn("ClientBlogSite", "slug").catch(() => false);

  const [sitesRaw, posts, newsletters, reviewSetups, bookingSites] = await Promise.all([
    prisma.clientBlogSite.findMany({
      select: ({ id: true, ownerId: true, updatedAt: true, ...(canUseSiteSlugColumn ? { slug: true } : {}) } as any),
    }).catch(() => [] as any[]),
    prisma.clientBlogPost.findMany({
      where: { status: "PUBLISHED", archivedAt: null },
      select: { siteId: true, slug: true, updatedAt: true, publishedAt: true },
    }).catch(() => [] as any[]),
    prisma.clientNewsletter.findMany({
      where: { kind: "EXTERNAL", status: "SENT" },
      select: { siteId: true, slug: true, updatedAt: true, sentAt: true },
    }).catch(() => [] as any[]),
    prisma.portalServiceSetup.findMany({
      where: { serviceSlug: "reviews" },
      select: { ownerId: true, dataJson: true, updatedAt: true },
    }).catch(() => [] as any[]),
    prisma.portalBookingSite.findMany({
      where: { enabled: true },
      select: { slug: true, updatedAt: true },
    }).catch(() => [] as any[]),
  ]);

  const sites = Array.isArray(sitesRaw) ? sitesRaw : [];
  const siteHandleById = new Map<string, string>();
  const siteByOwnerId = new Map<string, any>();
  for (const site of sites) {
    const siteId = String(site?.id || "").trim();
    const ownerId = String(site?.ownerId || "").trim();
    if (!siteId || !ownerId) continue;
    const handle = canUseSiteSlugColumn ? String((site as any)?.slug || siteId).trim() : siteId;
    if (!handle) continue;
    siteHandleById.set(siteId, handle);
    siteByOwnerId.set(ownerId, site);
  }

  const reviewsEnabledOwners = new Set(
    reviewSetups
      .filter((setup) => {
        const publicPage = setup?.dataJson && typeof setup.dataJson === "object" && !Array.isArray(setup.dataJson)
          ? (setup.dataJson as any).publicPage
          : null;
        return publicPage?.enabled === true;
      })
      .map((setup) => String(setup?.ownerId || "").trim())
      .filter(Boolean),
  );

  const dynamicPublicUrls: MetadataRoute.Sitemap = [];
  const pushUrl = (url: string, lastModified?: Date | string | null, changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"], priority?: number) => {
    if (!url) return;
    dynamicPublicUrls.push({
      url,
      lastModified: lastModified ? new Date(lastModified) : now,
      changeFrequency: changeFrequency || "weekly",
      priority: priority ?? 0.6,
    });
  };

  for (const post of posts) {
    const handle = siteHandleById.get(String(post?.siteId || "").trim());
    const slug = String(post?.slug || "").trim();
    if (!handle || !slug) continue;
    pushUrl(`${base}/${encodeURIComponent(handle)}/blogs`, post?.updatedAt || post?.publishedAt || now, "daily", 0.78);
    pushUrl(`${base}/${encodeURIComponent(handle)}/blogs/${encodeURIComponent(slug)}`, post?.updatedAt || post?.publishedAt || now, "weekly", 0.76);
  }

  for (const newsletter of newsletters) {
    const handle = siteHandleById.get(String(newsletter?.siteId || "").trim());
    const slug = String(newsletter?.slug || "").trim();
    if (!handle || !slug) continue;
    pushUrl(`${base}/${encodeURIComponent(handle)}/newsletters`, newsletter?.updatedAt || newsletter?.sentAt || now, "weekly", 0.68);
    pushUrl(`${base}/${encodeURIComponent(handle)}/newsletters/${encodeURIComponent(slug)}`, newsletter?.updatedAt || newsletter?.sentAt || now, "monthly", 0.64);
  }

  for (const ownerId of reviewsEnabledOwners) {
    const site = siteByOwnerId.get(ownerId);
    const handle = site ? (canUseSiteSlugColumn ? String((site as any)?.slug || site.id).trim() : String(site.id).trim()) : "";
    if (!handle) continue;
    pushUrl(`${base}/${encodeURIComponent(handle)}/reviews`, site?.updatedAt || now, "weekly", 0.66);
  }

  for (const site of bookingSites) {
    const slug = String(site?.slug || "").trim();
    if (!slug) continue;
    pushUrl(`${base}/book/${encodeURIComponent(slug)}`, site?.updatedAt || now, "weekly", 0.72);
  }

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/services`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/services/portal`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    ...serviceUrls,
    { url: `${base}/portal`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/book-a-call`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...dynamicPublicUrls,
  ];
}
