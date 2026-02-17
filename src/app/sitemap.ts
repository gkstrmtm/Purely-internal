import type { MetadataRoute } from "next";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://purelyautomation.com";
  const now = new Date();

  const serviceUrls = PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => ({
    url: `${base}/services/${encodeURIComponent(s.slug)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/services`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/services/portal`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    ...serviceUrls,
    { url: `${base}/portal`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/book-a-call`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];
}
