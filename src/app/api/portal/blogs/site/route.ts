import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { slugify } from "@/lib/slugify";
import { hasPublicColumn } from "@/lib/dbSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const upsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  primaryDomain: z.string().trim().max(253).optional().or(z.literal("")),
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

  const base = slugify(profile?.businessName ?? desiredName) || "blog";
  const desired = base.length >= 3 ? base : "blog";

  let slug = desired;
  if (canUseSlugColumn) {
    const collision = await prisma.clientBlogSite.findUnique({ where: { slug } });
    if (collision && collision.ownerId !== ownerId) {
      slug = `${desired}-${ownerId.slice(0, 6)}`;
    }
  }

  return slug;
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
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

  // Backfill slug for older sites.
  const currentSlug = (site as any)?.slug as string | null | undefined;

  if (site && canUseSlugColumn && !currentSlug) {
    const slug = await ensurePublicSlug(ownerId, site.name, true);
    site = (await prisma.clientBlogSite.update({
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

  return NextResponse.json({
    ok: true,
    site: site
      ? {
          ...(site as any),
          slug: canUseSlugColumn ? ((site as any).slug ?? null) : null,
        }
      : null,
  });
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

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
    // Treat create as idempotent: a customer can only have one site, so just return it.
    const currentSlug = (existing as any)?.slug as string | null | undefined;
    if (canUseSlugColumn && !currentSlug) {
      const slug = await ensurePublicSlug(ownerId, existing.name, true);
      const updated = (await prisma.clientBlogSite.update({
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
      return NextResponse.json({ ok: true, site: updated });
    }

    return NextResponse.json({
      ok: true,
      site: {
        ...(existing as any),
        slug: canUseSlugColumn ? ((existing as any).slug ?? null) : null,
      },
    });
  }

  const token = crypto.randomBytes(18).toString("hex");
  const slug = await ensurePublicSlug(ownerId, parsed.data.name.trim(), canUseSlugColumn);

  const created = (await prisma.clientBlogSite.create({
      data: {
        ownerId,
        name: parsed.data.name.trim(),
        ...(canUseSlugColumn ? { slug } : {}),
        primaryDomain: normalizeDomain(parsed.data.primaryDomain),
        verificationToken: token,
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
      slug: canUseSlugColumn ? ((created as any).slug ?? null) : null,
    },
  });
}

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

  const primaryDomain = normalizeDomain(parsed.data.primaryDomain);
  const name = parsed.data.name.trim();

  const existing = await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: { primaryDomain: true },
  });

  const domainChanged = (existing?.primaryDomain ?? null) !== primaryDomain;

  const updated = (await prisma.clientBlogSite.upsert({
    where: { ownerId },
    create: {
      ownerId,
      name,
      ...(canUseSlugColumn ? { slug: await ensurePublicSlug(ownerId, name, true) } : {}),
      primaryDomain,
      verificationToken: crypto.randomBytes(18).toString("hex"),
      verifiedAt: null,
    },
    update: {
      name,
      ...(await (async () => {
        if (!canUseSlugColumn) return {};
        const existing = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { slug: true } });
        if ((existing as any)?.slug) return {};
        return { slug: await ensurePublicSlug(ownerId, name, true) };
      })()),
      primaryDomain,
      ...(domainChanged
        ? {
            verifiedAt: null,
            verificationToken: crypto.randomBytes(18).toString("hex"),
          }
        : {}),
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
      slug: canUseSlugColumn ? ((updated as any).slug ?? null) : null,
    },
  });
}
