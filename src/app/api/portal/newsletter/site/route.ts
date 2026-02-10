import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { slugify } from "@/lib/slugify";
import { hasPublicColumn } from "@/lib/dbSchema";
import {
  ensureStoredBlogSiteSlug,
  getStoredBlogSiteSlug,
  setStoredBlogSiteSlug,
} from "@/lib/blogSiteSlug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const upsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  primaryDomain: z.string().trim().max(253).optional().or(z.literal("")),
  slug: z.string().trim().min(3).max(80).optional().or(z.literal("")),
});

function normalizeDomain(raw: string | null | undefined) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;

  const withoutProtocol = v.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  const d = withoutPath.replace(/:\d+$/, "");
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

export async function GET() {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

  let site = (await prisma.clientBlogSite.findUnique({
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
  })) as any;

  const currentSlug = (site as any)?.slug as string | null | undefined;

  if (site && canUseSlugColumn && !currentSlug) {
    const slug = await ensurePublicSlug(ownerId, site.name, true);
    site = (await (prisma.clientBlogSite as any).update({
      where: { ownerId },
      data: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
      },
    })) as any;
  }

  let fallbackSlug: string | null = null;
  if (site && !canUseSlugColumn) {
    fallbackSlug = await getStoredBlogSiteSlug(ownerId);
    if (!fallbackSlug) {
      fallbackSlug = await ensureStoredBlogSiteSlug(ownerId, site.name);
    }
  }

  return NextResponse.json({
    ok: true,
    site: site
      ? {
          ...(site as any),
          slug: canUseSlugColumn ? ((site as any).slug ?? null) : fallbackSlug,
        }
      : null,
  });
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("newsletter", "edit");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

  const slugFieldProvided = Object.prototype.hasOwnProperty.call(parsed.data, "slug");
  const rawSlug = typeof parsed.data.slug === "string" ? parsed.data.slug.trim() : "";
  const requestedSlug = rawSlug.length ? slugify(rawSlug) : null;

  if (slugFieldProvided && !canUseSlugColumn) {
    try {
      if (requestedSlug) {
        await setStoredBlogSiteSlug(ownerId, requestedSlug);
      } else {
        await ensureStoredBlogSiteSlug(ownerId, parsed.data.name.trim());
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "That link is already taken." },
        { status: 409 },
      );
    }
  }

  const existing = (await prisma.clientBlogSite.findUnique({
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
  })) as any;

  if (existing) {
    const name = parsed.data.name.trim();
    const primaryDomain = normalizeDomain(parsed.data.primaryDomain);

    let nextSlug: string | undefined = undefined;
    if (canUseSlugColumn && slugFieldProvided) {
      nextSlug = requestedSlug ? requestedSlug : await ensurePublicSlug(ownerId, name, true);

      const current = (existing as any)?.slug as string | null | undefined;
      if (nextSlug && nextSlug !== current) {
        const collision = (await (prisma.clientBlogSite as any).findUnique({
          where: { slug: nextSlug },
          select: { ownerId: true },
        })) as any;
        if (collision && collision.ownerId !== ownerId) {
          return NextResponse.json({ error: "That link is already taken." }, { status: 409 });
        }
      }
    }

    const updated = (await (prisma.clientBlogSite as any).update({
      where: { ownerId },
      data: {
        name,
        primaryDomain,
        ...(canUseSlugColumn && nextSlug !== undefined ? { slug: nextSlug } : {}),
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

    return NextResponse.json({
      ok: true,
      site: {
        ...(updated as any),
        slug: canUseSlugColumn ? ((updated as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
      },
    });
  }

  const token = crypto.randomBytes(18).toString("hex");
  const slug = requestedSlug ? requestedSlug : await ensurePublicSlug(ownerId, parsed.data.name.trim(), canUseSlugColumn);

  if (!canUseSlugColumn) {
    try {
      if (requestedSlug) {
        await setStoredBlogSiteSlug(ownerId, requestedSlug);
      } else {
        await ensureStoredBlogSiteSlug(ownerId, parsed.data.name.trim());
      }
    } catch {
      await ensureStoredBlogSiteSlug(ownerId, parsed.data.name.trim());
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
      name: parsed.data.name.trim(),
      primaryDomain: normalizeDomain(parsed.data.primaryDomain),
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

  return NextResponse.json({
    ok: true,
    site: {
      ...(created as any),
      slug: canUseSlugColumn ? ((created as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
    },
  });
}
