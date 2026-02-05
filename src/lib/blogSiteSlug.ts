import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";

const SERVICE_SLUG = "blog_site";

type BlogSiteSlugConfig = {
  version: 1;
  slug: string | null;
};

function parseConfig(value: unknown): BlogSiteSlugConfig {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const raw = typeof rec?.slug === "string" ? rec.slug.trim() : "";
  const slug = raw ? slugify(raw).slice(0, 80) : null;
  return { version: 1, slug: slug && slug.length >= 3 ? slug : null };
}

export async function getStoredBlogSiteSlug(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseConfig(row?.dataJson).slug;
}

export async function findOwnerIdByStoredBlogSiteSlug(slug: string): Promise<string | null> {
  const desired = slugify(String(slug || "").trim()).slice(0, 80);
  if (!desired || desired.length < 3) return null;

  try {
    const rows = await prisma.$queryRaw<Array<{ ownerId: string }>>`
      select "ownerId"
      from "PortalServiceSetup"
      where "serviceSlug" = ${SERVICE_SLUG}
        and ("dataJson"->>'slug') = ${desired}
      limit 1;
    `;
    return rows?.[0]?.ownerId ?? null;
  } catch {
    return null;
  }
}

async function isSlugTaken(desired: string, ownerId: string): Promise<boolean> {
  const existingOwnerId = await findOwnerIdByStoredBlogSiteSlug(desired);
  return Boolean(existingOwnerId && existingOwnerId !== ownerId);
}

export async function ensureStoredBlogSiteSlug(ownerId: string, desiredName: string): Promise<string> {
  const base = slugify(desiredName) || "blog";
  const desired = base.length >= 3 ? base.slice(0, 80) : "blog";

  let slug = desired;
  if (await isSlugTaken(slug, ownerId)) {
    slug = `${desired}-${ownerId.slice(0, 6)}`.slice(0, 80);
  }

  const normalized: BlogSiteSlugConfig = { version: 1, slug };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: normalized },
    update: { status: "COMPLETE", dataJson: normalized },
    select: { ownerId: true },
  });

  return slug;
}

export async function setStoredBlogSiteSlug(ownerId: string, slug: string | null): Promise<string | null> {
  const normalized = parseConfig({ slug });

  if (normalized.slug && (await isSlugTaken(normalized.slug, ownerId))) {
    throw new Error("That blog link is already taken.");
  }

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: normalized },
    update: { status: "COMPLETE", dataJson: normalized },
    select: { ownerId: true },
  });

  return normalized.slug;
}
