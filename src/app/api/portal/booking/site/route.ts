import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { hasPublicColumn } from "@/lib/dbSchema";
import { slugify } from "@/lib/slugify";
import {
  ensureStoredBlogSiteSlug,
  getStoredBlogSiteSlug,
  setStoredBlogSiteSlug,
} from "@/lib/blogSiteSlug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const upsertSchema = z.object({
  primaryDomain: z.string().trim().max(253).optional().or(z.literal("")),
});

function normalizeDomain(raw: string | null | undefined) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;

  const withoutProtocol = v.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  const d = withoutPath.replace(/:\d+$/, "").replace(/\.$/, "");
  return d.length ? d : null;
}

async function ensurePublicSlug(ownerId: string, desiredName: string, canUseSlugColumn: boolean) {
  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });

  const base = slugify(profile?.businessName ?? desiredName) || "site";
  const desired = base.length >= 3 ? base : "site";

  let slug = desired;
  if (canUseSlugColumn) {
    const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug } })) as any;
    if (collision && collision.ownerId !== ownerId) {
      slug = `${desired}-${ownerId.slice(0, 6)}`;
    }
  }

  return slug;
}

async function ensureBookingSiteSlug(ownerId: string) {
  const existing = await prisma.portalBookingSite.findUnique({
    where: { ownerId },
    select: { slug: true, title: true, enabled: true, updatedAt: true },
  }).catch(() => null);
  if (existing) return existing;

  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, name: true, timeZone: true } }).catch(() => null),
    prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } }).catch(() => null),
  ]);

  const base = slugify(profile?.businessName ?? user?.name ?? user?.email?.split("@")[0] ?? "booking");
  const desired = base.length >= 3 ? base : "booking";

  let slug = desired;
  const collision = await prisma.portalBookingSite.findUnique({ where: { slug }, select: { ownerId: true } }).catch(() => null);
  if (collision?.ownerId && String(collision.ownerId) !== ownerId) {
    slug = `${desired}-${ownerId.slice(0, 6)}`;
  }

  const title = profile?.businessName?.trim() ? `Book with ${profile.businessName.trim()}` : "Book a call";
  return prisma.portalBookingSite.create({
    data: {
      ownerId,
      slug,
      title,
      timeZone: user?.timeZone ?? "America/New_York",
      durationMinutes: 30,
      enabled: false,
    },
    select: { slug: true, title: true, enabled: true, updatedAt: true },
  });
}

function buildBookingPublicUrl(slug: unknown): string | null {
  const cleanSlug = typeof slug === "string" ? slug.trim() : "";
  return cleanSlug ? `/book/${encodeURIComponent(cleanSlug)}` : null;
}

export async function GET() {
  const auth = await requireClientSessionForService("booking");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const bookingSite = await ensureBookingSiteSlug(ownerId).catch(() => null);
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

  let site = (await prisma.clientBlogSite
    .findUnique({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      } as any,
    })
    .catch(() => null)) as any;

  const currentSlug = (site as any)?.slug as string | null | undefined;
  if (site && canUseSlugColumn && !currentSlug) {
    const slug = await ensurePublicSlug(ownerId, String(site.name || "Site"), true);
    site = (await (prisma.clientBlogSite as any).update({
      where: { ownerId },
      data: { slug },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      } as any,
    })) as any;
  }

  let fallbackSlug: string | null = null;
  if (site && !canUseSlugColumn) {
    fallbackSlug = await getStoredBlogSiteSlug(ownerId);
    if (!fallbackSlug) {
      fallbackSlug = await ensureStoredBlogSiteSlug(ownerId, String(site.name || "Site"));
    }
  }

  const bookingSlug = typeof bookingSite?.slug === "string" ? String(bookingSite.slug).trim() : "";
  const sitePayload = site
    ? {
        ...(site as any),
        slug: bookingSlug || null,
        publicUrl: buildBookingPublicUrl(bookingSlug),
        bookingEnabled: typeof bookingSite?.enabled === "boolean" ? Boolean(bookingSite.enabled) : null,
        bookingTitle: typeof bookingSite?.title === "string" ? String(bookingSite.title) : null,
      }
    : bookingSite
      ? {
          id: null,
          name: typeof bookingSite.title === "string" ? String(bookingSite.title) : "Booking",
          primaryDomain: null,
          verifiedAt: null,
          verificationToken: null,
          updatedAt: bookingSite.updatedAt,
          slug: bookingSlug || null,
          publicUrl: buildBookingPublicUrl(bookingSlug),
          bookingEnabled: typeof bookingSite.enabled === "boolean" ? Boolean(bookingSite.enabled) : null,
          bookingTitle: typeof bookingSite.title === "string" ? String(bookingSite.title) : null,
        }
      : null;

  return NextResponse.json({
    ok: true,
    site: sitePayload,
  });
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("booking", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const ownerId = auth.session.user.id;
  const bookingSite = await ensureBookingSiteSlug(ownerId).catch(() => null);
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

  const existing = (await prisma.clientBlogSite
    .findUnique({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      } as any,
    })
    .catch(() => null)) as any;

  const primaryDomain = normalizeDomain(parsed.data.primaryDomain);

  if (existing) {
    const currentPrimaryDomain = normalizeDomain((existing as any)?.primaryDomain);
    const domainChanged = primaryDomain !== currentPrimaryDomain;
    const tokenMissing = Boolean(primaryDomain) && !String((existing as any)?.verificationToken || "").trim();
    const nextVerificationToken =
      domainChanged && primaryDomain
        ? crypto.randomBytes(18).toString("hex")
        : tokenMissing
          ? crypto.randomBytes(18).toString("hex")
          : (existing as any)?.verificationToken;

    const updated = (await (prisma.clientBlogSite as any).update({
      where: { ownerId },
      data: {
        primaryDomain,
        ...(domainChanged
          ? { verifiedAt: null, verificationToken: nextVerificationToken }
          : tokenMissing
            ? { verificationToken: nextVerificationToken }
            : {}),
        ...(primaryDomain ? {} : domainChanged ? { verifiedAt: null } : {}),
      },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      } as any,
    })) as any;

    const bookingSlug = typeof bookingSite?.slug === "string" ? String(bookingSite.slug).trim() : "";
    return NextResponse.json({
      ok: true,
      site: {
        ...(updated as any),
        slug: bookingSlug || null,
        publicUrl: buildBookingPublicUrl(bookingSlug),
        bookingEnabled: typeof bookingSite?.enabled === "boolean" ? Boolean(bookingSite.enabled) : null,
        bookingTitle: typeof bookingSite?.title === "string" ? String(bookingSite.title) : null,
      },
    });
  }

  const token = crypto.randomBytes(18).toString("hex");

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });
  const name = String(profile?.businessName || "Hosted site").trim() || "Hosted site";

  const slug = await ensurePublicSlug(ownerId, name, canUseSlugColumn);

  if (!canUseSlugColumn) {
    try {
      await ensureStoredBlogSiteSlug(ownerId, name);
    } catch {
      // ignore
    }
  }

  if (canUseSlugColumn && slug) {
    const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } })) as any;
    if (collision && collision.ownerId !== ownerId) {
      return NextResponse.json({ error: "That link is already taken." }, { status: 409 });
    }
  }

  const created = (await (prisma.clientBlogSite as any).create({
    data: {
      ownerId,
      name,
      primaryDomain,
      verificationToken: token,
      ...(canUseSlugColumn ? { slug } : {}),
    },
    select: {
      id: true,
      name: true,
      primaryDomain: true,
      verifiedAt: true,
      verificationToken: true,
      updatedAt: true,
      ...(canUseSlugColumn ? { slug: true } : {}),
    } as any,
  })) as any;

  if (!canUseSlugColumn) {
    const stored = await getStoredBlogSiteSlug(ownerId);
    if (!stored) {
      try {
        await setStoredBlogSiteSlug(ownerId, slugify(name) || "site");
      } catch {
        // ignore
      }
    }
  }

  const bookingSlug = typeof bookingSite?.slug === "string" ? String(bookingSite.slug).trim() : "";
  return NextResponse.json({
    ok: true,
    site: {
      ...(created as any),
      slug: bookingSlug || null,
      publicUrl: buildBookingPublicUrl(bookingSlug),
      bookingEnabled: typeof bookingSite?.enabled === "boolean" ? Boolean(bookingSite.enabled) : null,
      bookingTitle: typeof bookingSite?.title === "string" ? String(bookingSite.title) : null,
    },
  });
}
